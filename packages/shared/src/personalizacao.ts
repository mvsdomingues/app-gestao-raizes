// ══════════════════════════════════════════════════════════
// CUSTO DA PERSONALIZAÇÃO DE UM ITEM (material + mão de obra)
// Sempre a partir das tabelas de Parâmetros › Tabelas gerais.
//
// Material:
//   área da arte (m²)   = altura (cm) × largura (cm) ÷ 10.000
//   área necessária     = quantidade × área da arte × (1 + folga da técnica)
//   material sugerido   = área necessária arredondada PARA CIMA em frações mínimas
//   custo do material   = material × preço por m²
// Mão de obra:
//   total = valor unitário da técnica × quantidade
// O operador pode ajustar material (m² ou R$) e mão de obra; o item fica marcado.
// Sem técnica: material (R$ do lote) e mão de obra (R$/un) sugeridos pelos valores padrão de
// Parâmetros › Precificação (como no cálculo anterior); o operador pode digitar, inclusive zero.
// ══════════════════════════════════════════════════════════

/** Técnica com os valores das tabelas de material e mão de obra (null = não cadastrado). */
export interface TecnicaComValores {
  id: number;
  nome: string;
  material: { preco_m2: number; fracao_minima: number; folga: number } | null;
  mao_obra: { valor_unitario: number } | null;
}

/** O que o operador informa no item do carrinho (null = usar o sugerido / vazio). */
export interface PersonalizacaoItem {
  /** null = sem personalização (valores digitados) */
  tecnica_id: number | null;
  altura_cm: number | null;
  largura_cm: number | null;
  /** Material em m² ajustado pelo operador (com técnica) */
  material_m2: number | null;
  /** Valor total do material em R$: ajuste do operador (com técnica) ou digitado (sem técnica) */
  material_valor: number | null;
  /** Mão de obra por unidade: ajuste (com técnica) ou digitada (sem técnica) */
  mao_obra_unit: number | null;
}

export function personalizacaoVazia(): PersonalizacaoItem {
  return { tecnica_id: null, altura_cm: null, largura_cm: null, material_m2: null, material_valor: null, mao_obra_unit: null };
}

/** Resultado do cálculo (também gravado no item do orçamento, só para uso interno). */
export interface ResultadoPersonalizacao {
  tecnica_id: number | null;
  tecnica: string | null;
  altura_cm: number | null;
  largura_cm: number | null;
  /** Valores da tabela usados no cálculo */
  preco_m2: number | null;
  fracao_minima: number | null;
  folga: number | null;
  area_arte_m2: number;
  area_necessaria_m2: number;
  fracoes: number;
  material_m2_sugerido: number;
  material_valor_sugerido: number;
  material_m2: number;
  material_valor: number;
  /** Material por unidade (entra no custo unitário) */
  material_unit: number;
  mao_obra_unit_sugerido: number;
  mao_obra_unit: number;
  mao_obra_total: number;
  material_ajustado: boolean;
  mao_obra_ajustada: boolean;
  /** O que o operador informou (para reabrir o orçamento no carrinho) */
  entrada: PersonalizacaoItem;
  /** Impede gerar o orçamento (cadastro incompleto, arte sem medidas…) */
  erro: string | null;
}

/** Arredonda para evitar sujeira de ponto flutuante (0,1 + 0,2…). */
const arred = (v: number, casas = 6) => Math.round(v * 10 ** casas) / 10 ** casas;
const dinheiro = (v: number) => Math.round(v * 100) / 100;

/** Quantidade de frações mínimas para cobrir a área (tolerância a erro de arredondamento). */
export function fracoesNecessarias(area: number, fracao: number): number {
  if (area <= 0 || fracao <= 0) return 0;
  return Math.ceil(arred(area / fracao, 9) - 1e-9);
}

/** Valores padrão (R$/un) de quando o item não tem técnica: Parâmetros › Precificação. */
export interface PadraoSemTecnica {
  material_unit: number;
  mao_obra_unit: number;
}

export function calcularPersonalizacao(
  p: PersonalizacaoItem,
  qty: number,
  tecnicas: TecnicaComValores[] | null,
  padrao: PadraoSemTecnica = { material_unit: 0, mao_obra_unit: 0 },
): ResultadoPersonalizacao {
  const q = Math.max(1, qty);
  const base = {
    tecnica_id: p.tecnica_id,
    altura_cm: p.altura_cm,
    largura_cm: p.largura_cm,
    entrada: { ...p },
  };

  // Sem técnica: valores padrão por unidade, ou o que o operador digitou (zero é válido)
  if (p.tecnica_id === null) {
    const materialSugerido = dinheiro(Math.max(0, padrao.material_unit) * q);
    const moSugerido = Math.max(0, padrao.mao_obra_unit);
    const material = p.material_valor !== null ? Math.max(0, p.material_valor) : materialSugerido;
    const mo = p.mao_obra_unit !== null ? Math.max(0, p.mao_obra_unit) : moSugerido;
    return {
      ...base,
      tecnica: null,
      preco_m2: null,
      fracao_minima: null,
      folga: null,
      area_arte_m2: 0,
      area_necessaria_m2: 0,
      fracoes: 0,
      material_m2_sugerido: 0,
      material_valor_sugerido: materialSugerido,
      material_m2: 0,
      material_valor: material,
      material_unit: material / q,
      mao_obra_unit_sugerido: moSugerido,
      mao_obra_unit: mo,
      mao_obra_total: mo * q,
      material_ajustado: p.material_valor !== null && dinheiro(p.material_valor) !== materialSugerido,
      mao_obra_ajustada: p.mao_obra_unit !== null && dinheiro(p.mao_obra_unit) !== dinheiro(moSugerido),
      erro: null,
    };
  }

  const t = tecnicas?.find((x) => x.id === p.tecnica_id) ?? null;
  const faltando: string[] = [];
  if (t && !t.material) faltando.push('Material');
  if (t && !t.mao_obra) faltando.push('Mão de obra');
  const erroCadastro = !tecnicas
    ? 'Carregando as tabelas de personalização…'
    : !t
      ? 'A técnica escolhida não existe mais. Escolha outra técnica.'
      : faltando.length
        ? `Cadastre a técnica "${t.nome}" na tabela ${faltando.join(' e na tabela ')} (Parâmetros › Tabelas gerais).`
        : null;
  const semMedidas = !(p.altura_cm && p.altura_cm > 0 && p.largura_cm && p.largura_cm > 0);

  const preco = t?.material?.preco_m2 ?? 0;
  const fracao = t?.material?.fracao_minima ?? 0;
  const folga = t?.material?.folga ?? 0;
  const areaArte = semMedidas ? 0 : arred(((p.altura_cm ?? 0) * (p.largura_cm ?? 0)) / 10_000);
  const areaNecessaria = arred(q * areaArte * (1 + folga));
  const fracoes = fracoesNecessarias(areaNecessaria, fracao);
  const m2Sugerido = arred(fracoes * fracao);
  const valorSugerido = dinheiro(m2Sugerido * preco);

  const m2 = p.material_m2 !== null ? Math.max(0, p.material_m2) : m2Sugerido;
  const valor = p.material_valor !== null ? Math.max(0, p.material_valor) : dinheiro(m2 * preco);
  const moSugerido = t?.mao_obra?.valor_unitario ?? 0;
  const mo = p.mao_obra_unit !== null ? Math.max(0, p.mao_obra_unit) : moSugerido;

  return {
    ...base,
    tecnica: t?.nome ?? null,
    preco_m2: t?.material ? preco : null,
    fracao_minima: t?.material ? fracao : null,
    folga: t?.material ? folga : null,
    area_arte_m2: areaArte,
    area_necessaria_m2: areaNecessaria,
    fracoes,
    material_m2_sugerido: m2Sugerido,
    material_valor_sugerido: valorSugerido,
    material_m2: m2,
    material_valor: valor,
    material_unit: valor / q,
    mao_obra_unit_sugerido: moSugerido,
    mao_obra_unit: mo,
    mao_obra_total: mo * q,
    material_ajustado:
      (p.material_m2 !== null && arred(p.material_m2) !== m2Sugerido) ||
      (p.material_valor !== null && dinheiro(p.material_valor) !== dinheiro(m2 * preco)),
    mao_obra_ajustada: p.mao_obra_unit !== null && dinheiro(p.mao_obra_unit) !== dinheiro(moSugerido),
    erro: erroCadastro ?? (semMedidas ? 'Informe a altura e a largura da arte (cm).' : null),
  };
}

/** Texto curto para a composição do preço e a folha interna. */
export function descreverPersonalizacao(r: ResultadoPersonalizacao): string {
  const n = (v: number, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: 4 });
  if (r.tecnica_id === null) {
    const ajustes = [r.material_ajustado && 'material ajustado', r.mao_obra_ajustada && 'mão de obra ajustada'].filter(Boolean);
    return ['sem técnica de personalização', ...ajustes].join(' · ');
  }
  const partes = [`${r.tecnica} · arte ${n(r.altura_cm ?? 0, 1)} × ${n(r.largura_cm ?? 0, 1)} cm`, `material ${n(r.material_m2)} m²`];
  if (r.material_ajustado) partes.push('material ajustado');
  if (r.mao_obra_ajustada) partes.push('mão de obra ajustada');
  return partes.join(' · ');
}
