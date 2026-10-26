import { useApp } from '../../app/contexto';

/** Cartões com a última atualização de cada fornecedor. */
export function CartoesStatus() {
  const { status } = useApp();
  return (
    <div id="status-cards">
      {status === null ? null : status.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
          Nenhuma atualização registrada.
          <br />
          Execute <code>npm run atualizar</code>.
        </p>
      ) : (
        status.map((r) => {
          const ok = r.status === 'OK';
          return (
            <div className="status-card" key={r.fornecedor}>
              <div>
                <div className="status-card-name">{r.fornecedor}</div>
                <div className="status-card-date">{r.data_hora}</div>
                {!ok && <div className="status-card-err">{r.status}</div>}
                <span className={`status-pill ${ok ? 'ok' : 'err'}`}>{ok ? '✓ Atualizado' : '✘ Erro'}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="status-card-total">{r.total}</div>
                <div className="status-card-label">produtos</div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
