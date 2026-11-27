import type { DadosGeraisSite } from '@raizes/contrato-site';

/** Link do WhatsApp com a mensagem pronta (null = sem WhatsApp configurado). */
export function linkWhatsApp(geral: DadosGeraisSite, mensagem?: string): string | null {
  if (!geral.whatsapp) return null;
  return `https://wa.me/${geral.whatsapp}?text=${encodeURIComponent(mensagem || geral.mensagem_whatsapp)}`;
}

export function mensagemProduto(p: { nome: string; codigo: string; minimo: number }, cor?: string | null, quantidade?: number): string {
  const qtd = quantidade && quantidade >= p.minimo ? quantidade : p.minimo;
  return (
    `Olá! Quero um orçamento do produto ${p.nome} (código ${p.codigo})` +
    `${cor ? `, na cor ${cor}` : ''}, ${quantidade ? `${qtd} unidades` : `a partir de ${p.minimo} unidades`}.`
  );
}
