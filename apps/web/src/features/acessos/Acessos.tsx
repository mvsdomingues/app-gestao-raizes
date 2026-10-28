import { useCallback, useEffect, useMemo, useState } from 'react';
import { TELAS_SISTEMA, type AcessoUsuario, type IdTela } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { Carregando } from '../../components/Carregando';
import { api } from '../../lib/api';

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; msg: string } | { tipo: 'ok'; usuarios: AcessoUsuario[] };

const GRUPOS = [...new Set(TELAS_SISTEMA.map((t) => t.grupo))];

/** Tela "Acessos": escolhe quais telas (funcionalidades) cada usuário pode usar. */
export function Acessos() {
  const { tela, visitas, usuarioAcessos } = useApp();
  const { usuario: eu, atualizar } = useSessao();
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [marcadas, setMarcadas] = useState<Set<IdTela>>(new Set());
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async (escolher?: number | null) => {
    try {
      const usuarios = await api.acessos();
      setEstado({ tipo: 'ok', usuarios });
      setSelecionado((atual) => {
        const id = escolher ?? atual;
        return usuarios.some((u) => u.id === id) ? id! : (usuarios[0]?.id ?? null);
      });
    } catch (e) {
      setEstado({ tipo: 'erro', msg: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    if (visitas.acessos > 0) {
      setAviso(null);
      void carregar(usuarioAcessos);
    }
  }, [visitas.acessos, usuarioAcessos, carregar]);

  const usuarios = estado.tipo === 'ok' ? estado.usuarios : [];
  const atual = usuarios.find((u) => u.id === selecionado) ?? null;

  // Ao trocar de usuário, carrega as telas dele
  useEffect(() => {
    setMarcadas(new Set(atual?.permissoes ?? []));
  }, [atual]);

  const alterado = useMemo(() => {
    if (!atual) return false;
    return atual.permissoes.length !== marcadas.size || atual.permissoes.some((p) => !marcadas.has(p));
  }, [atual, marcadas]);

  const alternar = (t: IdTela) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const escolher = (id: number) => {
    if (alterado && !confirm('Há alterações não salvas. Descartar?')) return;
    setAviso(null);
    setSelecionado(id);
  };

  const salvar = async () => {
    if (!atual) return;
    if (atual.id === eu?.id && !marcadas.has('acessos')) {
      if (!confirm('Você está removendo o seu próprio acesso à tela Acessos e não poderá mais alterá-los. Continuar?')) return;
    }
    setSalvando(true);
    setAviso(null);
    try {
      const r = await api.salvarAcessos(
        atual.id,
        TELAS_SISTEMA.map((t) => t.id).filter((t) => marcadas.has(t)),
      );
      setEstado((e) =>
        e.tipo === 'ok' ? { tipo: 'ok', usuarios: e.usuarios.map((u) => (u.id === r.id ? r : u)) } : e,
      );
      setAviso({ tipo: 'ok', texto: `✓ Acessos de ${r.nome} salvos. Valem a partir da próxima ação do usuário.` });
      if (r.id === eu?.id) void atualizar(); // meus acessos mudaram: atualiza o menu
    } catch (e) {
      setAviso({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div id="view-acessos" className="view-cadastro" style={{ display: tela === 'acessos' ? 'block' : 'none' }}>
      <div className="cadastro-wrap">
        <div className="carrinho-header-bar">
          <div>
            <h2 className="carrinho-page-title">Acessos</h2>
            <p className="carrinho-page-sub">Escolha as telas (funcionalidades) que cada usuário pode usar.</p>
          </div>
        </div>

        {estado.tipo === 'carregando' ? (
          <Carregando texto="Carregando acessos…" />
        ) : estado.tipo === 'erro' ? (
          <div className="orc-empty-state">
            <h2>Erro ao carregar os acessos</h2>
            <p>{estado.msg}</p>
          </div>
        ) : (
          <div className="acessos-layout">
            <aside className="acessos-usuarios" aria-label="Usuários">
              {usuarios.map((u) => (
                <button
                  key={u.id}
                  className={`acessos-usuario${u.id === selecionado ? ' ativo' : ''}`}
                  data-login={u.login}
                  onClick={() => escolher(u.id)}
                >
                  <span className="acessos-usuario-nome">
                    {u.nome}
                    {u.id === eu?.id && <span className="tag-voce">você</span>}
                  </span>
                  <span className="acessos-usuario-info">
                    @{u.login} · {u.permissoes.length} de {TELAS_SISTEMA.length} telas
                  </span>
                </button>
              ))}
            </aside>

            {atual && (
              <section className="acessos-telas" id="acessos-telas">
                <div className="acessos-telas-topo">
                  <div>
                    <div className="acessos-quem">{atual.nome}</div>
                    <div className="acessos-quem-login">@{atual.login}</div>
                  </div>
                  <div className="acessos-atalhos">
                    <button className="btn-back" onClick={() => setMarcadas(new Set(TELAS_SISTEMA.map((t) => t.id)))}>
                      Marcar todas
                    </button>
                    <button className="btn-back" onClick={() => setMarcadas(new Set())}>
                      Desmarcar todas
                    </button>
                  </div>
                </div>

                {GRUPOS.map((g) => (
                  <fieldset className="acessos-grupo" key={g}>
                    <legend>{g}</legend>
                    {TELAS_SISTEMA.filter((t) => t.grupo === g).map((t) => (
                      <label key={t.id} className={`acessos-tela${marcadas.has(t.id) ? ' marcada' : ''}`}>
                        <input
                          type="checkbox"
                          value={t.id}
                          checked={marcadas.has(t.id)}
                          onChange={() => alternar(t.id)}
                        />
                        {t.rotulo}
                      </label>
                    ))}
                  </fieldset>
                ))}

                {aviso && <div className={`form-mensagem ${aviso.tipo}`}>{aviso.texto}</div>}

                <div className="acessos-acoes">
                  {alterado && <span className="acessos-pendente">Alterações não salvas</span>}
                  <button
                    className="btn-primary"
                    id="btn-salvar-acessos"
                    disabled={!alterado || salvando}
                    onClick={() => void salvar()}
                  >
                    {salvando ? 'Salvando…' : 'Salvar acessos'}
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
