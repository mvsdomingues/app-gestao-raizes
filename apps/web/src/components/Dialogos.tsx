import { useEffect, useRef, useState } from 'react';
import { assinarDialogos, type Dialogo, type TipoDialogo } from '../lib/dialogo';

const ICONES: Record<TipoDialogo, string> = {
  info: 'i',
  sucesso: '✓',
  aviso: '!',
  erro: '✕',
  confirmacao: '?',
  perigo: '!',
};

/** Quebras de linha da mensagem: linha em branco = parágrafo, \n = nova linha. */
function Texto({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/\n{2,}/).map((p, i) => (
        <p key={i}>
          {p.split('\n').map((l, j) => (
            <span key={j}>
              {j > 0 && <br />}
              {l}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

/** Desenha os pop-ups do site (avisar, confirmar, perguntar), um de cada vez. */
export function Dialogos() {
  const [fila, setFila] = useState<Dialogo[]>([]);
  useEffect(() => assinarDialogos(setFila), []);
  const atual = fila[0];
  return atual ? <CaixaDialogo key={atual.id} d={atual} /> : null;
}

function CaixaDialogo({ d }: { d: Dialogo }) {
  const [valor, setValor] = useState('');
  const [faltando, setFaltando] = useState(false);
  const okRef = useRef<HTMLButtonElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const cancelavel = d.modo !== 'avisar';

  const cancelar = () => d.responder(d.modo === 'confirmar' ? false : null);
  const confirmarDialogo = () => {
    if (d.modo === 'perguntar') {
      if (d.campo?.obrigatorio && !valor.trim()) {
        setFaltando(true);
        campoRef.current?.focus();
        return;
      }
      d.responder(valor.trim());
    } else {
      d.responder(true);
    }
  };

  useEffect(() => {
    (d.modo === 'perguntar' ? campoRef.current : okRef.current)?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (cancelavel) cancelar();
        else d.responder(true);
      }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, []);

  return (
    <div className="dialogo-fundo" role="presentation">
      <div
        className={`dialogo dialogo-${d.tipo}`}
        role={cancelavel ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={`dialogo-titulo-${d.id}`}
        id="dialogo"
      >
        <div className="dialogo-cabecalho">
          <span className="dialogo-icone" aria-hidden="true">
            {ICONES[d.tipo]}
          </span>
          <h3 className="dialogo-titulo" id={`dialogo-titulo-${d.id}`}>
            {d.titulo}
          </h3>
        </div>
        <div className="dialogo-mensagem">
          <Texto texto={d.mensagem} />
        </div>
        {d.campo && (
          <div className="dialogo-campo">
            {d.campo.rotulo && (
              <label className="custom-modal-label" htmlFor={`dialogo-campo-${d.id}`}>
                {d.campo.rotulo}
                {d.campo.obrigatorio && ' *'}
              </label>
            )}
            <textarea
              id={`dialogo-campo-${d.id}`}
              ref={campoRef}
              className={`custom-input${faltando ? ' invalido' : ''}`}
              rows={3}
              maxLength={500}
              placeholder={d.campo.placeholder}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                if (e.target.value.trim()) setFaltando(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  confirmarDialogo();
                }
              }}
            />
            {faltando && <div className="campo-dica erro">Preencha este campo para continuar.</div>}
          </div>
        )}
        <div className="dialogo-acoes">
          {cancelavel && (
            <button type="button" className="btn-secondary" id="dialogo-cancelar" onClick={cancelar}>
              {d.cancelar}
            </button>
          )}
          <button
            type="button"
            ref={okRef}
            className={`btn-primary${d.tipo === 'perigo' ? ' perigo' : ''}`}
            id="dialogo-ok"
            onClick={confirmarDialogo}
          >
            {d.ok}
          </button>
        </div>
      </div>
    </div>
  );
}
