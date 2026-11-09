import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  formatBRL,
  LIMITE_DESCRICAO_TECNICA,
  LIMITE_NOME_TECNICA,
  type ParametroMaoObra,
  type ParametroMaterial,
  type TecnicaPersonalizacao,
} from '@raizes/shared';
import { api } from '../../lib/api';
import { confirmar, erroDe } from '../../lib/dialogo';

const numero = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 4 });
/** Número para o campo de edição ("85,5") */
const paraCampo = (v: number) => String(v).replace('.', ',');

type Registro = { id: number };

/** Modal simples de inclusão/alteração (mesmo visual dos demais cadastros). */
export function ModalRegistro({
  aberto,
  titulo,
  fechar,
  salvar,
  children,
  id,
}: {
  aberto: boolean;
  titulo: string;
  fechar: () => void;
  salvar: () => Promise<void>;
  children: ReactNode;
  id: string;
}) {
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (aberto) setErro('');
  }, [aberto]);
  if (!aberto) return null;
  const confirmarSalvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      await salvar();
      fechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <div className="custom-modal-backdrop open" id={id} onClick={(e) => e.target === e.currentTarget && fechar()}>
      <form
        className="custom-modal-card"
        onSubmit={(e) => {
          e.preventDefault();
          void confirmarSalvar();
        }}
      >
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{titulo}</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
        {erro && <div className="form-mensagem erro">{erro}</div>}
        <div className="custom-modal-actions">
          <button className="btn-secondary" type="button" onClick={fechar}>
            Cancelar
          </button>
          <button className="btn-primary" type="submit" disabled={salvando} id={`${id}-salvar`}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Cabeçalho e tabela de um cadastro. */
export function SecaoTabela<T extends Registro>({
  id,
  titulo,
  sub,
  colunas,
  linhas,
  vazio,
  incluir,
  podeIncluir = true,
  avisoIncluir,
  alterar,
  excluir,
  render,
}: {
  id: string;
  titulo: string;
  sub: string;
  colunas: { titulo: string; num?: boolean; largura?: number }[];
  linhas: T[] | null;
  vazio: string;
  incluir: () => void;
  podeIncluir?: boolean;
  avisoIncluir?: string;
  alterar: (r: T) => void;
  excluir: (r: T) => void;
  render: (r: T) => ReactNode[];
}) {
  return (
    <section className="update-panel param-panel param-tabela" id={id}>
      <div className="update-panel-header">
        <div>
          <h3 className="update-panel-title">{titulo}</h3>
          <p className="update-panel-sub">{sub}</p>
        </div>
        <button className="btn-novo" type="button" id={`${id}-incluir`} onClick={incluir} disabled={!podeIncluir} title={podeIncluir ? undefined : avisoIncluir}>
          + Incluir
        </button>
      </div>
      {!podeIncluir && avisoIncluir && <p className="param-nota">{avisoIncluir}</p>}
      {linhas === null ? (
        <p className="param-nota">Carregando…</p>
      ) : linhas.length === 0 ? (
        <p className="param-tabela-vazia">{vazio}</p>
      ) : (
        <table className="orc-table cadastro-table">
          <thead>
            <tr>
              {colunas.map((c) => (
                <th key={c.titulo} className={c.num ? 'num' : undefined} style={c.largura ? { width: c.largura } : undefined}>
                  {c.titulo}
                </th>
              ))}
              <th style={{ width: 96 }} />
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.id} className="cadastro-row" onDoubleClick={() => alterar(r)}>
                {render(r).map((celula, i) => (
                  <td key={i} className={colunas[i]?.num ? 'num' : undefined}>
                    {celula}
                  </td>
                ))}
                <td className="cadastro-acoes">
                  <button className="cadastro-acao" title="Alterar" onClick={() => alterar(r)}>
                    ✎
                  </button>
                  <button className="cadastro-acao perigo" title="Excluir" onClick={() => excluir(r)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SeletorTecnica({ tecnicas, valor, mudar, id }: { tecnicas: TecnicaPersonalizacao[]; valor: string; mudar: (v: string) => void; id: string }) {
  return (
    <div className="custom-modal-field">
      <label className="custom-modal-label" htmlFor={id}>
        Técnica de personalização *
      </label>
      <select id={id} className="custom-input" value={valor} onChange={(e) => mudar(e.target.value)} required>
        <option value="">Escolha uma técnica…</option>
        {tecnicas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
          </option>
        ))}
      </select>
    </div>
  );
}

export function CampoNumero({ id, rotulo, valor, mudar, prefixo, sufixo, dica }: { id: string; rotulo: string; valor: string; mudar: (v: string) => void; prefixo?: string; sufixo?: string; dica?: string }) {
  return (
    <div className="custom-modal-field" style={{ flex: 1 }}>
      <label className="custom-modal-label" htmlFor={id}>
        {rotulo} *
      </label>
      <div className="param-numero">
        {prefixo && <span>{prefixo}</span>}
        <input id={id} className="custom-input" inputMode="decimal" value={valor} placeholder="0,00" onChange={(e) => mudar(e.target.value)} required />
        {sufixo && <span>{sufixo}</span>}
      </div>
      {dica && <span className="param-campo-dica">{dica}</span>}
    </div>
  );
}

/** Aba "Tabelas gerais": técnicas de personalização, material e mão de obra. */
export function ParametrosTabelas({ visitas }: { visitas: number }) {
  const [tecnicas, setTecnicas] = useState<TecnicaPersonalizacao[] | null>(null);
  const [material, setMaterial] = useState<ParametroMaterial[] | null>(null);
  const [maoObra, setMaoObra] = useState<ParametroMaoObra[] | null>(null);

  // Modais (null = fechado; 'novo' = inclusão; registro = alteração)
  const [tec, setTec] = useState<TecnicaPersonalizacao | 'novo' | null>(null);
  const [tecForm, setTecForm] = useState({ nome: '', descricao: '' });
  const [mat, setMat] = useState<ParametroMaterial | 'novo' | null>(null);
  const [matForm, setMatForm] = useState({ tecnica_id: '', preco_m2: '', fracao_minima: '', folga_percentual: '' });
  const [mo, setMo] = useState<ParametroMaoObra | 'novo' | null>(null);
  const [moForm, setMoForm] = useState({ tecnica_id: '', valor_unitario: '' });

  const carregar = useCallback(async () => {
    try {
      const [t, m, o] = await Promise.all([api.tecnicas(), api.parametrosMaterial(), api.parametrosMaoObra()]);
      setTecnicas(t);
      setMaterial(m);
      setMaoObra(o);
    } catch (e) {
      void erroDe('Não foi possível carregar as tabelas.', e);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [visitas, carregar]);

  const excluirCom = async (pergunta: string, acao: () => Promise<unknown>) => {
    if (!(await confirmar(pergunta, { titulo: 'Excluir registro', ok: 'Excluir', perigo: true }))) return;
    try {
      await acao();
      await carregar();
    } catch (e) {
      void erroDe('Não foi possível excluir.', e);
    }
  };

  const listaTecnicas = tecnicas ?? [];
  const semTecnicas = tecnicas !== null && tecnicas.length === 0;
  const avisoSemTecnicas = 'Cadastre primeiro as técnicas de personalização.';

  return (
    <div className="param-tabelas" id="param-tabelas">
      <SecaoTabela
        id="tab-tecnicas"
        titulo="Técnicas de personalização"
        sub="Lista usada nas tabelas de material e de mão de obra."
        colunas={[{ titulo: 'Técnica de personalização', largura: 260 }, { titulo: 'Descrição' }]}
        linhas={tecnicas}
        vazio="Nenhuma técnica cadastrada. Ex.: Silk screen, Tampografia, Laser, Sublimação, Bordado, UV."
        incluir={() => {
          setTecForm({ nome: '', descricao: '' });
          setTec('novo');
        }}
        alterar={(t) => {
          setTecForm({ nome: t.nome, descricao: t.descricao });
          setTec(t);
        }}
        excluir={(t) => void excluirCom(`Excluir a técnica "${t.nome}"?`, () => api.excluirTecnica(t.id))}
        render={(t) => [<b key="n">{t.nome}</b>, <span key="d" className="param-descricao">{t.descricao || '—'}</span>]}
      />

      <SecaoTabela
        id="tab-material"
        titulo="Material"
        sub="Valor do material por técnica: preço por metro quadrado, fração mínima cobrada e folga (sobra para não faltar material)."
        colunas={[
          { titulo: 'Técnica de personalização' },
          { titulo: 'Preço por m²', num: true, largura: 140 },
          { titulo: 'Fração mínima', num: true, largura: 140 },
          { titulo: 'Folga', num: true, largura: 100 },
        ]}
        linhas={material}
        vazio="Nenhum valor de material cadastrado."
        podeIncluir={!semTecnicas}
        avisoIncluir={semTecnicas ? avisoSemTecnicas : undefined}
        incluir={() => {
          setMatForm({ tecnica_id: '', preco_m2: '', fracao_minima: '', folga_percentual: '' });
          setMat('novo');
        }}
        alterar={(m) => {
          setMatForm({ tecnica_id: String(m.tecnica_id), preco_m2: paraCampo(m.preco_m2), fracao_minima: paraCampo(m.fracao_minima), folga_percentual: paraCampo(Math.round(m.folga * 10000) / 100) });
          setMat(m);
        }}
        excluir={(m) => void excluirCom(`Excluir o valor de material da técnica "${m.tecnica}"?`, () => api.excluirMaterial(m.id))}
        render={(m) => [m.tecnica, formatBRL(m.preco_m2), `${numero(m.fracao_minima, 2)} m²`, `${numero(m.folga * 100, 0)}%`]}
      />

      <SecaoTabela
        id="tab-mao-obra"
        titulo="Mão de obra"
        sub="Valor unitário (por peça) da mão de obra de cada técnica."
        colunas={[{ titulo: 'Técnica de personalização' }, { titulo: 'Valor unitário', num: true, largura: 150 }]}
        linhas={maoObra}
        vazio="Nenhum valor de mão de obra cadastrado."
        podeIncluir={!semTecnicas}
        avisoIncluir={semTecnicas ? avisoSemTecnicas : undefined}
        incluir={() => {
          setMoForm({ tecnica_id: '', valor_unitario: '' });
          setMo('novo');
        }}
        alterar={(m) => {
          setMoForm({ tecnica_id: String(m.tecnica_id), valor_unitario: paraCampo(m.valor_unitario) });
          setMo(m);
        }}
        excluir={(m) => void excluirCom(`Excluir o valor de mão de obra da técnica "${m.tecnica}"?`, () => api.excluirMaoObra(m.id))}
        render={(m) => [m.tecnica, formatBRL(m.valor_unitario)]}
      />

      <ModalRegistro
        id="modal-tecnica"
        aberto={tec !== null}
        titulo={tec === 'novo' ? 'Nova técnica de personalização' : 'Alterar técnica de personalização'}
        fechar={() => setTec(null)}
        salvar={async () => {
          await api.salvarTecnica(tecForm, tec && tec !== 'novo' ? tec.id : undefined);
          await carregar();
        }}
      >
        <div className="custom-modal-field">
          <label className="custom-modal-label" htmlFor="tecnica-nome">
            Técnica de personalização *
          </label>
          <input
            id="tecnica-nome"
            className="custom-input"
            maxLength={LIMITE_NOME_TECNICA}
            placeholder="Ex.: Silk screen"
            value={tecForm.nome}
            onChange={(e) => setTecForm((f) => ({ ...f, nome: e.target.value }))}
            autoFocus
            required
          />
        </div>
        <div className="custom-modal-field">
          <label className="custom-modal-label" htmlFor="tecnica-descricao">
            Descrição
          </label>
          <textarea
            id="tecnica-descricao"
            className="custom-input"
            rows={3}
            maxLength={LIMITE_DESCRICAO_TECNICA}
            placeholder="Ex.: Serigrafia em até 4 cores, ideal para superfícies planas"
            value={tecForm.descricao}
            onChange={(e) => setTecForm((f) => ({ ...f, descricao: e.target.value }))}
          />
        </div>
      </ModalRegistro>

      <ModalRegistro
        id="modal-material"
        aberto={mat !== null}
        titulo={mat === 'novo' ? 'Novo valor de material' : 'Alterar valor de material'}
        fechar={() => setMat(null)}
        salvar={async () => {
          if (!matForm.tecnica_id) throw new Error('Escolha a técnica de personalização.');
          await api.salvarMaterial({ ...matForm, tecnica_id: Number(matForm.tecnica_id) }, mat && mat !== 'novo' ? mat.id : undefined);
          await carregar();
        }}
      >
        <SeletorTecnica id="material-tecnica" tecnicas={listaTecnicas} valor={matForm.tecnica_id} mudar={(v) => setMatForm((f) => ({ ...f, tecnica_id: v }))} />
        <div className="custom-modal-row">
          <CampoNumero id="material-preco" rotulo="Preço por m²" prefixo="R$" valor={matForm.preco_m2} mudar={(v) => setMatForm((f) => ({ ...f, preco_m2: v }))} />
          <CampoNumero
            id="material-fracao"
            rotulo="Fração mínima"
            sufixo="m²"
            valor={matForm.fracao_minima}
            mudar={(v) => setMatForm((f) => ({ ...f, fracao_minima: v }))}
            dica="Menor área cobrada (ex.: 0,01 m² = 10 × 10 cm)"
          />
          <CampoNumero
            id="material-folga"
            rotulo="Folga"
            sufixo="%"
            valor={matForm.folga_percentual}
            mudar={(v) => setMatForm((f) => ({ ...f, folga_percentual: v }))}
            dica="Acrescida à área antes do arredondamento (0 a 100)"
          />
        </div>
      </ModalRegistro>

      <ModalRegistro
        id="modal-mao-obra"
        aberto={mo !== null}
        titulo={mo === 'novo' ? 'Novo valor de mão de obra' : 'Alterar valor de mão de obra'}
        fechar={() => setMo(null)}
        salvar={async () => {
          if (!moForm.tecnica_id) throw new Error('Escolha a técnica de personalização.');
          await api.salvarMaoObra({ ...moForm, tecnica_id: Number(moForm.tecnica_id) }, mo && mo !== 'novo' ? mo.id : undefined);
          await carregar();
        }}
      >
        <SeletorTecnica id="mao-obra-tecnica" tecnicas={listaTecnicas} valor={moForm.tecnica_id} mudar={(v) => setMoForm((f) => ({ ...f, tecnica_id: v }))} />
        <CampoNumero id="mao-obra-valor" rotulo="Valor unitário" prefixo="R$" valor={moForm.valor_unitario} mudar={(v) => setMoForm((f) => ({ ...f, valor_unitario: v }))} dica="Por peça personalizada" />
      </ModalRegistro>
    </div>
  );
}
