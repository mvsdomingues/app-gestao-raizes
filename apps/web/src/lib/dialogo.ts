/**
 * Pop-ups no estilo do site, no lugar de alert/confirm/prompt do navegador.
 * Podem ser chamados de qualquer lugar (componentes, hooks, funções):
 *
 *   await avisar('Orçamento gravado.', { tipo: 'sucesso' });
 *   if (!(await confirmar('Excluir o produto?', { perigo: true, ok: 'Excluir' }))) return;
 *   const motivo = await perguntar('Informe o motivo', { obrigatorio: true });
 *
 * O componente <Dialogos /> (montado em App) desenha a fila.
 */

export type TipoDialogo = 'info' | 'sucesso' | 'aviso' | 'erro' | 'confirmacao' | 'perigo';

export interface OpcoesDialogo {
  titulo?: string;
  /** Texto do botão principal */
  ok?: string;
  /** Texto do botão secundário (confirmar/perguntar) */
  cancelar?: string;
}

export interface Dialogo {
  id: number;
  modo: 'avisar' | 'confirmar' | 'perguntar';
  tipo: TipoDialogo;
  titulo: string;
  mensagem: string;
  ok: string;
  cancelar: string;
  campo?: { rotulo: string; obrigatorio: boolean; placeholder: string };
  responder: (valor: boolean | string | null) => void;
}

type Ouvinte = (fila: Dialogo[]) => void;

let fila: Dialogo[] = [];
let sequencia = 0;
const ouvintes = new Set<Ouvinte>();

function publicar() {
  for (const o of ouvintes) o(fila);
}

export function assinarDialogos(o: Ouvinte): () => void {
  ouvintes.add(o);
  o(fila);
  return () => ouvintes.delete(o);
}

function abrir<T>(d: Omit<Dialogo, 'id' | 'responder'>, converter: (v: boolean | string | null) => T): Promise<T> {
  return new Promise((ok) => {
    const id = ++sequencia;
    fila = [
      ...fila,
      {
        ...d,
        id,
        responder: (v) => {
          fila = fila.filter((x) => x.id !== id);
          publicar();
          ok(converter(v));
        },
      },
    ];
    publicar();
  });
}

const TITULOS: Record<TipoDialogo, string> = {
  info: 'Aviso',
  sucesso: 'Pronto',
  aviso: 'Atenção',
  erro: 'Não foi possível concluir',
  confirmacao: 'Confirmar',
  perigo: 'Confirmar',
};

/** Mensagem com um botão OK. */
export function avisar(
  mensagem: string,
  opcoes: OpcoesDialogo & { tipo?: 'info' | 'sucesso' | 'aviso' | 'erro' } = {},
): Promise<void> {
  const tipo = opcoes.tipo ?? 'info';
  return abrir(
    { modo: 'avisar', tipo, titulo: opcoes.titulo ?? TITULOS[tipo], mensagem, ok: opcoes.ok ?? 'OK', cancelar: '' },
    () => undefined,
  );
}

/** Mensagem de erro (atalho de avisar com tipo "erro"). */
export function erro(mensagem: string, opcoes: OpcoesDialogo = {}): Promise<void> {
  return avisar(mensagem, { ...opcoes, tipo: 'erro' });
}

/** Mensagem de erro a partir de uma exceção: "Prefixo: mensagem do servidor". */
export function erroDe(prefixo: string, e: unknown): Promise<void> {
  const detalhe = e instanceof Error ? e.message : String(e);
  return erro(detalhe ? `${prefixo}\n\n${detalhe}` : prefixo);
}

/** Pergunta Sim/Não. `perigo` destaca ações destrutivas (botão vermelho). */
export function confirmar(mensagem: string, opcoes: OpcoesDialogo & { perigo?: boolean } = {}): Promise<boolean> {
  const tipo: TipoDialogo = opcoes.perigo ? 'perigo' : 'confirmacao';
  return abrir(
    {
      modo: 'confirmar',
      tipo,
      titulo: opcoes.titulo ?? TITULOS[tipo],
      mensagem,
      ok: opcoes.ok ?? 'Confirmar',
      cancelar: opcoes.cancelar ?? 'Cancelar',
    },
    (v) => v === true,
  );
}

/** Pede um texto. Devolve null se cancelado. */
export function perguntar(
  mensagem: string,
  opcoes: OpcoesDialogo & { rotulo?: string; obrigatorio?: boolean; placeholder?: string; perigo?: boolean } = {},
): Promise<string | null> {
  const tipo: TipoDialogo = opcoes.perigo ? 'perigo' : 'confirmacao';
  return abrir(
    {
      modo: 'perguntar',
      tipo,
      titulo: opcoes.titulo ?? TITULOS[tipo],
      mensagem,
      ok: opcoes.ok ?? 'Confirmar',
      cancelar: opcoes.cancelar ?? 'Cancelar',
      campo: { rotulo: opcoes.rotulo ?? '', obrigatorio: !!opcoes.obrigatorio, placeholder: opcoes.placeholder ?? '' },
    },
    (v) => (typeof v === 'string' ? v : null),
  );
}
