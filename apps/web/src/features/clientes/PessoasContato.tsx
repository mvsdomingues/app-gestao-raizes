import { useState } from 'react';
import {
  digitos,
  formatarTelefone,
  LIMITE_CARGO_CONTATO,
  LIMITE_OBSERVACAO_CONTATO,
  validarClienteBasico,
  type Cliente,
  type ClienteVinculado,
  type FichaCliente,
  type PessoaContato,
} from '@raizes/shared';
import { api, type DadosPessoaContato } from '../../lib/api';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';
import { SeletorCliente } from './SeletorCliente';

/**
 * Ficha do cliente › Contatos: as pessoas que compram pela empresa. Uma é a principal
 * (vem primeiro nos orçamentos); contato usado em orçamento ou pedido fica inativo em vez de excluído.
 */
export function SecaoPessoas({
  cliente: c,
  atualizar,
}: {
  cliente: Cliente;
  atualizar: (f?: FichaCliente) => Promise<void> | void;
}) {
  const [editando, setEditando] = useState<PessoaContato | 'novo' | null>(null);

  const acao = async (f: () => Promise<FichaCliente | unknown>, msg: string) => {
    try {
      const r = await f();
      await atualizar(r && typeof r === 'object' && 'cliente' in r && 'historico' in r ? (r as FichaCliente) : undefined);
    } catch (e) {
      void erroDe(msg, e);
    }
  };

  return (
    <div className="clientes-pessoas" id="cliente-pessoas">
      <div className="clientes-pessoas-topo">
        <div className="clientes-secao-titulo">Contatos (pessoas)</div>
        {c.ativo && (
          <button type="button" className="btn-secondary" id="btn-novo-contato-ficha" onClick={() => setEditando('novo')}>
            + Novo contato
          </button>
        )}
      </div>
      {c.pessoas.length === 0 && <p className="fat-dica">Nenhum contato.</p>}
      <ul className="clientes-pessoas-lista">
        {c.pessoas.map((p) => (
          <li key={p.id} className={`clientes-pessoa${p.ativo ? '' : ' inativa'}`}>
            <div className="clientes-pessoa-dados">
              <div className="clientes-pessoa-nome">
                {p.nome}
                {p.cargo && <span className="clientes-pessoa-cargo"> · {p.cargo}</span>}
                {p.principal && <span className="clientes-pessoa-tag principal">principal</span>}
                {!p.ativo && <span className="clientes-pessoa-tag">inativo</span>}
              </div>
              <div className="opcao-sub">
                {[p.telefone ? formatarTelefone(p.telefone) : '', p.email].filter(Boolean).join(' · ') || 'sem telefone e e-mail'}
                {p.orcamentos > 0 && (
                  <span className="opcao-meta">
                    {' '}
                    · {p.orcamentos} orçamento{p.orcamentos > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              {p.observacao && <div className="clientes-pessoa-obs">{p.observacao}</div>}
            </div>
            {c.ativo && (
              <div className="clientes-pessoa-acoes">
                <button type="button" className="link-botao" onClick={() => setEditando(p)}>
                  alterar
                </button>
                {p.ativo && !p.principal && (
                  <button
                    type="button"
                    className="link-botao"
                    onClick={() =>
                      void acao(() => api.principalPessoa(c.id, p.id), 'Não foi possível trocar o contato principal.')
                    }
                  >
                    tornar principal
                  </button>
                )}
                {!p.principal && (
                  <button
                    type="button"
                    className="link-botao"
                    onClick={() =>
                      void acao(
                        () => api.ativoPessoa(c.id, p.id, !p.ativo),
                        `Não foi possível ${p.ativo ? 'inativar' : 'reativar'} o contato.`,
                      )
                    }
                  >
                    {p.ativo ? 'inativar' : 'reativar'}
                  </button>
                )}
                {!p.principal && p.orcamentos === 0 && (
                  <button
                    type="button"
                    className="link-botao perigo"
                    onClick={async () => {
                      if (await confirmar(`Excluir o contato ${p.nome}?`, { perigo: true, ok: 'Excluir' }))
                        void acao(() => api.excluirPessoa(c.id, p.id), 'Não foi possível excluir o contato.');
                    }}
                  >
                    excluir
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {editando && (
        <ModalPessoa
          cliente={c}
          pessoa={editando === 'novo' ? null : editando}
          fechar={() => setEditando(null)}
          salvo={async () => {
            setEditando(null);
            await atualizar();
          }}
        />
      )}
    </div>
  );
}

/** Inclusão ou alteração de um contato na tela Clientes. */
function ModalPessoa({
  cliente,
  pessoa,
  fechar,
  salvo,
}: {
  cliente: Cliente;
  pessoa: PessoaContato | null;
  fechar: () => void;
  salvo: () => void;
}) {
  const [d, setD] = useState<Required<DadosPessoaContato>>({
    nome: pessoa?.nome ?? '',
    cargo: pessoa?.cargo ?? '',
    telefone: pessoa?.telefone ? formatarTelefone(pessoa.telefone) : '',
    email: pessoa?.email ?? '',
    observacao: pessoa?.observacao ?? '',
  });
  const [principal, setPrincipal] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const campo = (k: keyof typeof d) => ({
    value: d[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD((x) => ({ ...x, [k]: e.target.value })),
  });

  const salvar = async () => {
    const e = validarClienteBasico({ nome: d.nome.trim(), telefone: digitos(d.telefone), email: d.email.trim() });
    if (e) {
      setErro(e.replace(' ou a razão social', '').replace(' do cliente', ''));
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      if (pessoa) await api.alterarPessoa(cliente.id, pessoa.id, d);
      else {
        const r = await api.incluirPessoa(cliente.id, { ...d, principal });
        if (r.avisos.length)
          await avisar(
            `Este telefone ou e-mail também está em: ${r.avisos.map((a) => `${a.codigo} ${a.nome}`).join(', ')}. Confira se é a mesma pessoa em outra empresa.`,
            { tipo: 'aviso', titulo: 'Contato em outro cliente' },
          );
      }
      salvo();
    } catch (er) {
      setErro(er instanceof Error ? er.message : String(er));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="custom-modal-backdrop open" id="modal-pessoa" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <form
        className="custom-modal-card novo-cliente-modal"
        role="dialog"
        aria-label={pessoa ? 'Alterar contato' : 'Novo contato'}
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{pessoa ? 'Alterar contato' : 'Novo contato'}</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          Pessoa que compra por <b>{cliente.nome}</b>. Nome e telefone ou e-mail.
        </p>
        <div className="novo-cliente-campos">
          <label>
            Nome
            <input className="custom-input" id="pessoa-nome" maxLength={150} autoFocus {...campo('nome')} />
          </label>
          <label>
            <span>Cargo / setor <span className="opcional">(opcional)</span></span>
            <input className="custom-input" id="pessoa-cargo" maxLength={LIMITE_CARGO_CONTATO} {...campo('cargo')} />
          </label>
          <label>
            Telefone (com DDD)
            <input className="custom-input" id="pessoa-telefone" inputMode="tel" {...campo('telefone')} />
          </label>
          <label>
            E-mail
            <input className="custom-input" id="pessoa-email" type="email" {...campo('email')} />
          </label>
          <label>
            <span>Observação <span className="opcional">(opcional)</span></span>
            <textarea
              className="custom-input"
              id="pessoa-observacao"
              rows={2}
              maxLength={LIMITE_OBSERVACAO_CONTATO}
              {...campo('observacao')}
            />
          </label>
          {!pessoa && (
            <label className="com-check">
              <input type="checkbox" checked={principal} onChange={(e) => setPrincipal(e.target.checked)} />
              Contato principal (o primeiro que aparece nos orçamentos)
            </label>
          )}
        </div>
        {erro && <div className="form-mensagem erro">{erro}</div>}
        <div className="custom-modal-actions">
          <button type="button" className="btn-secondary" onClick={fechar}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary" id="btn-salvar-pessoa" disabled={salvando}>
            {salvando ? 'Salvando…' : pessoa ? 'Salvar' : 'Incluir contato'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Confirma e faz o "Transformar em contato de…" (origem vira contato da empresa destino). */
export async function transformarEmContato(
  origem: { id: number; codigo: string; nome: string },
  destino: { id: number; codigo?: string; nome: string },
): Promise<FichaCliente | null> {
  const ok = await confirmar(
    `${origem.codigo} ${origem.nome} vira contato de ${destino.codigo ?? ''} ${destino.nome}.\n\n` +
      `Os contatos, telefones extras, orçamentos e pedidos de ${origem.codigo} passam para ${destino.nome} (cada orçamento e pedido mantém a pessoa de contato) e ${origem.codigo} fica inativo. Fica no histórico dos dois e não é desfeito automaticamente.`,
    { titulo: 'Transformar em contato', ok: 'Transformar' },
  );
  if (!ok) return null;
  try {
    const f = await api.transformarEmContato(origem.id, destino.id);
    void avisar(`${origem.nome} agora é contato de ${destino.nome}.`, { tipo: 'sucesso' });
    return f;
  } catch (e) {
    void erroDe('Não foi possível transformar em contato.', e);
    return null;
  }
}

/** Escolha da empresa para o "Transformar em contato de…" (busca do cadastro, sem incluir cliente novo). */
export function ModalTransformar({
  origem,
  fechar,
  feito,
}: {
  origem: Cliente;
  fechar: () => void;
  feito: (destinoId: number) => void;
}) {
  const [destino, setDestino] = useState<ClienteVinculado | null>(null);
  return (
    <div className="custom-modal-backdrop open" id="modal-transformar" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div className="custom-modal-card novo-cliente-modal" role="dialog" aria-label="Transformar em contato">
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">Transformar em contato de…</h3>
          <button type="button" className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          Use quando <b>{origem.nome}</b> é, na verdade, uma pessoa de uma empresa já cadastrada. Busque a empresa:
        </p>
        <SeletorCliente id="transformar-destino" valor={destino} aoMudar={setDestino} permitirNovo={false} />
        <div className="custom-modal-actions">
          <button type="button" className="btn-secondary" onClick={fechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            id="btn-confirmar-transformar"
            disabled={!destino || destino.id === origem.id}
            onClick={async () => {
              if (!destino) return;
              const f = await transformarEmContato(origem, destino);
              if (f) feito(f.cliente.id);
            }}
          >
            Transformar
          </button>
        </div>
      </div>
    </div>
  );
}
