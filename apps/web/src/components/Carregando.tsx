import type { ReactNode } from 'react';

/** Bloco "spinner + texto" usado nas listas enquanto os dados carregam. */
export function Carregando({ texto }: { texto: string }) {
  return (
    <div className="loading">
      <div className="spinner" />
      <span>{texto}</span>
    </div>
  );
}

/** Mesmo bloco, sem spinner (mensagens de vazio/erro). */
export function Aviso({ children }: { children: ReactNode }) {
  return <div className="loading">{children}</div>;
}
