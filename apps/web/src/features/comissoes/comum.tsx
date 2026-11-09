import { formatarDataBr, vigenteEm, type CarteiraComissao, type FaixaComissao } from '@raizes/shared';

export const pct = (v: number, casas = 2) =>
  `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })}%`;
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** Número para campo de edição ("2,5") */
export const paraCampo = (v: number) => String(Math.round(v * 1e6) / 1e6).replace('.', ',');
export const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const mesAtual = () => hojeIso().slice(0, 7);

/** "até R$ 10.000 → 2,5% · R$ 10.000 a R$ 30.000 → 4% · acima de R$ 30.000 → 5%" */
export function resumoFaixas(faixas: FaixaComissao[]): string {
  return faixas
    .map((f) =>
      f.ate === null
        ? `acima de ${brl(f.de)} → ${pct(f.percentual)}`
        : f.de === 0
          ? `até ${brl(f.ate)} → ${pct(f.percentual)}`
          : `${brl(f.de)} a ${brl(f.ate)} → ${pct(f.percentual)}`,
    )
    .join(' · ');
}

/** "5% desde 01/01/2026" (percentual vigente hoje) */
export function percentualAtual(c: CarteiraComissao): string {
  const v = vigenteEm(c.percentuais, hojeIso());
  if (v) return `${pct(v.percentual)} desde ${formatarDataBr(v.vigente_de)}`;
  const futuro = [...c.percentuais].sort((a, b) => a.vigente_de.localeCompare(b.vigente_de))[0];
  return futuro ? `a partir de ${formatarDataBr(futuro.vigente_de)}: ${pct(futuro.percentual)}` : 'sem percentual';
}
