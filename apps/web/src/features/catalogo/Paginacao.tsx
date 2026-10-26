interface Props {
  atual: number;
  total: number;
  irPara: (p: number) => void;
}

const reticencias = <span style={{ color: 'var(--muted)', padding: '0 4px' }}>…</span>;

/** Paginação com janela de ±2 páginas, primeira/última e reticências. */
export function Paginacao({ atual, total, irPara }: Props) {
  const ini = Math.max(1, atual - 2);
  const fim = Math.min(total, atual + 2);
  const paginas: number[] = [];
  for (let i = ini; i <= fim; i++) paginas.push(i);

  return (
    <>
      <button className="page-btn" onClick={() => irPara(atual - 1)} disabled={atual <= 1}>
        ←
      </button>
      {ini > 1 && (
        <button className="page-btn" onClick={() => irPara(1)}>
          1
        </button>
      )}
      {ini > 2 && reticencias}
      {paginas.map((i) => (
        <button key={i} className={`page-btn${i === atual ? ' active' : ''}`} onClick={() => irPara(i)}>
          {i}
        </button>
      ))}
      {fim < total - 1 && reticencias}
      {fim < total && (
        <button className="page-btn" onClick={() => irPara(total)}>
          {total}
        </button>
      )}
      <button className="page-btn" onClick={() => irPara(atual + 1)} disabled={atual >= total}>
        →
      </button>
    </>
  );
}
