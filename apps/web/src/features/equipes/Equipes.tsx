import { useEffect, useState } from 'react';
import { DESDE_SEMPRE, LIMITE_NOME_EQUIPE, type Equipe, type RespostaEquipes } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';
import { esquecerOpcoesRelatorio } from '../relatorios/BarraFiltros';

const dataBr = (s: string) => s.split('-').reverse().join('/');

/**
 * Cadastros › Equipes de vendas: gestor e vendedores de cada equipe (usadas nos relatórios).
 * Mudar um vendedor de equipe vale a partir de hoje: as vendas anteriores continuam na equipe antiga.
 */
export function Equipes() {
  const { tela, visitas } = useApp();
  const [dados, setDados] = useState<RespostaEquipes | null>(null);
  const [editando, setEditando] = useState<Equipe | 'nova' | null>(null);
  const [usuarios, setUsuarios] = useState<{ id: number; nome: string; inativo: boolean }[]>([]);

  const carregar = async () => {
    try {
      const [e, u] = await Promise.all([api.equipes(), api.responsaveis()]);
      setDados(e);
      setUsuarios(u);
    } catch (e) {
      void erroDe('Não foi possível carregar as equipes.', e);
    }
  };

  useEffect(() => {
    if (visitas.equipes > 0) void carregar();
  }, [visitas.equipes]);

  const alterarSituacao = async (e: Equipe) => {
    if (
      e.ativa &&
      !(await confirmar(`Inativar a equipe ${e.nome}? Ela continua nos relatórios dos períodos em que teve vendas.`))
    )
      return;
    try {
      await api.alterarEquipe(e.id, { ativa: !e.ativa });
      esquecerOpcoesRelatorio();
      await carregar();
    } catch (er) {
      void erroDe(`Não foi possível ${e.ativa ? 'inativar' : 'reativar'} a equipe.`, er);
    }
  };

  const ativas = dados?.equipes.filter((e) => e.ativa) ?? [];
  const inativas = dados?.equipes.filter((e) => !e.ativa) ?? [];

  return (
    <div id="view-equipes" className="dash-tela equipes-tela" style={{ display: tela === 'equipes' ? 'block' : 'none' }}>
      <div className="dash-cabecalho">
        <div>
          <h2 className="dash-titulo">Equipes de vendas</h2>
          <p className="dash-subtitulo">
            Gestor e vendedores de cada equipe, para filtrar e comparar nos relatórios. Cada vendedor fica em uma equipe por vez.
          </p>
        </div>
        <button type="button" className="btn-novo" id="btn-nova-equipe" onClick={() => setEditando('nova')}>
          + Nova equipe
        </button>
      </div>

      {!dados && <p className="dash-vazio">Carregando…</p>}
      {dados && ativas.length === 0 && <p className="dash-vazio">Nenhuma equipe cadastrada.</p>}

      <div className="equipes-grade">
        {ativas.map((e) => (
          <CartaoEquipe key={e.id} e={e} alterar={() => setEditando(e)} situacao={() => void alterarSituacao(e)} />
        ))}
      </div>

      {dados && dados.sem_equipe.length > 0 && (
        <section className="dash-cartao equipes-sem" id="equipes-sem-equipe">
          <h3 className="dash-cartao-titulo">Sem equipe</h3>
          <p className="dash-cartao-sub">
            Usuários ativos que não estão em nenhuma equipe (nos relatórios, aparecem em "Sem equipe").
          </p>
          <div className="equipes-chips">
            {dados.sem_equipe.map((u) => (
              <span key={u.id} className="equipes-chip">
                {u.nome}
              </span>
            ))}
          </div>
        </section>
      )}

      {inativas.length > 0 && (
        <>
          <h3 className="equipes-subtitulo">Inativas</h3>
          <div className="equipes-grade">
            {inativas.map((e) => (
              <CartaoEquipe key={e.id} e={e} alterar={() => setEditando(e)} situacao={() => void alterarSituacao(e)} />
            ))}
          </div>
        </>
      )}

      {editando && dados && (
        <ModalEquipe
          equipe={editando === 'nova' ? null : editando}
          equipes={dados.equipes}
          usuarios={usuarios}
          fechar={() => setEditando(null)}
          salvo={async () => {
            setEditando(null);
            esquecerOpcoesRelatorio();
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function CartaoEquipe({ e, alterar, situacao }: { e: Equipe; alterar: () => void; situacao: () => void }) {
  return (
    <section className={`dash-cartao equipes-cartao${e.ativa ? '' : ' inativa'}`} data-equipe={e.nome}>
      <header className="equipes-cartao-topo">
        <div>
          <h3 className="dash-cartao-titulo">{e.nome}</h3>
          <p className="dash-cartao-sub">
            Gestor: <b>{e.gestor?.nome ?? 'não definido'}</b> · {e.membros.length}{' '}
            {e.membros.length === 1 ? 'vendedor' : 'vendedores'}
          </p>
        </div>
        <div className="equipes-acoes">
          {e.ativa && (
            <button type="button" className="link-botao" onClick={alterar}>
              alterar
            </button>
          )}
          <button type="button" className="link-botao" onClick={situacao}>
            {e.ativa ? 'inativar' : 'reativar'}
          </button>
        </div>
      </header>
      {e.membros.length ? (
        <div className="equipes-chips">
          {e.membros.map((m) => (
            <span
              key={m.id}
              className={`equipes-chip${m.inativo ? ' inativo' : ''}`}
              title={m.desde === DESDE_SEMPRE ? 'Primeira equipe' : `Desde ${dataBr(m.desde)}`}
            >
              {m.nome}
              {m.inativo ? ' (inativo)' : ''}
            </span>
          ))}
        </div>
      ) : (
        <p className="dash-vazio">Sem vendedores.</p>
      )}
    </section>
  );
}

function ModalEquipe({
  equipe,
  equipes,
  usuarios,
  fechar,
  salvo,
}: {
  equipe: Equipe | null;
  equipes: Equipe[];
  usuarios: { id: number; nome: string; inativo: boolean }[];
  fechar: () => void;
  salvo: () => void;
}) {
  const [nome, setNome] = useState(equipe?.nome ?? '');
  const [gestor, setGestor] = useState(equipe?.gestor ? String(equipe.gestor.id) : '');
  const [membros, setMembros] = useState<number[]>(equipe?.membros.map((m) => m.id) ?? []);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  /** Equipe atual de cada usuário (para avisar quem vai mudar de equipe) */
  const equipeDe = new Map<number, string>();
  for (const e of equipes) if (e.id !== equipe?.id) for (const m of e.membros) equipeDe.set(m.id, e.nome);
  const ativos = usuarios.filter((u) => !u.inativo || membros.includes(u.id));
  const mudam = membros.filter((id) => equipeDe.has(id));

  const salvar = async () => {
    if (!nome.trim()) return setErro('Informe o nome da equipe.');
    setSalvando(true);
    setErro('');
    try {
      const dadosEquipe = { nome: nome.trim(), gestor_id: gestor ? Number(gestor) : null, membros };
      if (equipe) await api.alterarEquipe(equipe.id, dadosEquipe);
      else await api.criarEquipe(dadosEquipe);
      if (mudam.length)
        void avisar(
          `${mudam.length === 1 ? 'Mudou de equipe' : 'Mudaram de equipe'} a partir de hoje: ${mudam
            .map((id) => usuarios.find((u) => u.id === id)?.nome)
            .join(', ')}. As vendas anteriores continuam na equipe antiga.`,
          { tipo: 'sucesso' },
        );
      salvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="custom-modal-backdrop open" id="modal-equipe" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <form
        className="custom-modal-card novo-cliente-modal"
        role="dialog"
        aria-label={equipe ? 'Alterar equipe' : 'Nova equipe'}
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{equipe ? `Alterar ${equipe.nome}` : 'Nova equipe'}</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="novo-cliente-campos">
          <label>
            Nome
            <input
              className="custom-input"
              id="equipe-nome"
              maxLength={LIMITE_NOME_EQUIPE}
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>
          <label>
            Gestor
            <select className="custom-input" id="equipe-gestor" value={gestor} onChange={(e) => setGestor(e.target.value)}>
              <option value="">— sem gestor —</option>
              {usuarios
                .filter((u) => !u.inativo)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
            </select>
          </label>
          <fieldset className="equipes-membros" id="equipe-membros">
            <legend>Vendedores</legend>
            {ativos.map((u) => (
              <label key={u.id} className="com-check">
                <input
                  type="checkbox"
                  checked={membros.includes(u.id)}
                  onChange={(e) => setMembros((m) => (e.target.checked ? [...m, u.id] : m.filter((x) => x !== u.id)))}
                />
                {u.nome}
                {equipeDe.has(u.id) && <span className="equipes-de-outra"> · hoje em {equipeDe.get(u.id)}</span>}
              </label>
            ))}
          </fieldset>
          {mudam.length > 0 && (
            <p className="fat-dica">
              Quem está em outra equipe muda para esta a partir de hoje; as vendas anteriores continuam na equipe antiga.
            </p>
          )}
        </div>
        {erro && <div className="form-mensagem erro">{erro}</div>}
        <div className="custom-modal-actions">
          <button type="button" className="btn-secondary" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" id="btn-salvar-equipe" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}
