import { useApp } from '../app/contexto';

/** Rodapé com a última atualização de cada fornecedor. */
export function BarraStatus() {
  const { status } = useApp();

  return (
    <div className="status-bar" id="status-bar">
      {status === null ? (
        <span className="status-item">
          <span className="status-dot none" />
          Carregando…
        </span>
      ) : status.length === 0 ? (
        <span className="status-item">
          <span className="status-dot none" />
          Nenhuma atualização registrada.
        </span>
      ) : (
        status.map((r) => (
          <span className="status-item" key={r.fornecedor}>
            <span className={`status-dot ${r.status === 'OK' ? '' : 'error'}`} />{' '}
            <strong>{r.fornecedor}</strong>: {r.total} produtos · {r.data_hora}
          </span>
        ))
      )}
    </div>
  );
}
