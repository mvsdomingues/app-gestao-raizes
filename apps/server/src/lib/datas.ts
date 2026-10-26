// Formatos de data/hora em horário LOCAL (iguais aos gravados pela versão anterior).
// Atenção: nunca usar toISOString() aqui — ele converte para UTC.

const p2 = (n: number) => String(n).padStart(2, '0');

/** 2026-10-24T18:13:29 — usado em orçamentos e no status da atualização. */
export function isoLocal(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` +
    `T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  );
}

/** 2026-10-24 18:04:38 — usado em produtos.atualizado e atualizacoes.data_hora. */
export function dataHoraLocal(d: Date = new Date()): string {
  return isoLocal(d).replace('T', ' ');
}

/** 24/10/2026 18:04:38 — usado nas mensagens do log de atualização. */
export function dataHoraBR(d: Date = new Date()): string {
  return (
    `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  );
}
