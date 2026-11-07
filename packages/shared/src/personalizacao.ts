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
  /** Onde vai a aplicação (tampa, frente, verso…); opcional, aparece para o cliente */
  local?: string | null;
}

/** Máximo de aplicações de personalização por item e tamanho do campo "local". */
export const LIMITE_APLICACOES = 5;
export const LIMITE_LOCAL = 40;

/** "  Tampa  " → "Tampa"; vazio → null. */
export function normalizarLocal(local: string | null | undefined): string | null {
  const l = (local ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITE_LOCAL);
  return l || null;
}

export function personalizacaoVazia(): PersonalizacaoItem {
  return { tecnica_id: null, altura_cm: null, largura_cm: null, material_m2: null, material_valor: null, mao_obra_unit: null, local: null };
}

/** Resultado do cálculo (também gravado no item do orçamento, só para uso interno). */
export interface ResultadoPersonalizacao {
  tecnica_id: number | null;
  tecnica: string | null;
  /** Local da aplicação (tampa, frente…) */
  local?: string | null;
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
  /**
   * Material calculado em conjunto com os outros itens da mesma técnica no orçamento
   * (área somada e arredondada uma vez só; cada item fica com a parte da sua área).
   */
  grupo?: GrupoMaterial;
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
    local: normalizarLocal(p.local),
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

/** Material de uma técnica somado no orçamento. */
export interface GrupoMaterial {
  /** Quantos itens dividem o material */
  itens: number;
  area_necessaria_m2: number;
  fracoes: number;
  material_m2: number;
  material_valor: number;
}

/** Item do orçamento/carrinho para o cálculo em conjunto. */
export interface ItemPersonalizacao<K> {
  chave: K;
  personalizacao: PersonalizacaoItem;
  qty: number;
}

/**
 * Personalização de todos os itens do orçamento. O material de cada técnica é
 * calculado em conjunto: as áreas necessárias (já com a folga) dos itens são somadas,
 * arredondadas UMA vez em frações mínimas e o material é rateado pela área de cada
 * item. Assim várias cores do mesmo produto (ou produtos diferentes com a mesma
 * técnica) não pagam uma fração mínima cada. Ajustes do operador valem por item.
 * Um item sozinho na técnica dá o mesmo resultado de `calcularPersonalizacao`.
 */
export function calcularPersonalizacaoOrcamento<K>(
  itens: ItemPersonalizacao<K>[],
  tecnicas: TecnicaComValores[] | null,
  padrao?: PadraoSemTecnica,
): Map<K, ResultadoPersonalizacao> {
  const res = new Map<K, ResultadoPersonalizacao>();
  const grupos = new Map<number, { chave: K; r: ResultadoPersonalizacao; qtd: number }[]>();
  for (const i of itens) {
    const r = calcularPersonalizacao(i.personalizacao, i.qty, tecnicas, padrao);
    res.set(i.chave, r);
    // Só entram no rateio itens com técnica de cadastro completo e arte medida
    if (r.tecnica_id === null || r.erro) continue;
    const g = grupos.get(r.tecnica_id) ?? [];
    g.push({ chave: i.chave, r, qtd: Math.max(1, i.qty) });
    grupos.set(r.tecnica_id, g);
  }

  for (const membros of grupos.values()) {
    const fracao = membros[0]!.r.fracao_minima ?? 0;
    const preco = membros[0]!.r.preco_m2 ?? 0;
    const area = arred(membros.reduce((s, m) => s + m.r.area_necessaria_m2, 0));
    const fracoes = fracoesNecessarias(area, fracao);
    const m2Grupo = arred(fracoes * fracao);
    const valorGrupo = dinheiro(m2Grupo * preco);
    const grupo: GrupoMaterial = { itens: membros.length, area_necessaria_m2: area, fracoes, material_m2: m2Grupo, material_valor: valorGrupo };

    // Rateio pela área; os centavos que sobram do arredondamento ficam no último item
    let valorDistribuido = 0;
    membros.forEach((m, n) => {
      const parte = area > 0 ? m.r.area_necessaria_m2 / area : 0;
      const m2Sug = arred(m2Grupo * parte);
      const valorSug = n === membros.length - 1 ? dinheiro(valorGrupo - valorDistribuido) : dinheiro(valorGrupo * parte);
      valorDistribuido = dinheiro(valorDistribuido + valorSug);

      const p = m.r.entrada;
      const m2 = p.material_m2 !== null ? Math.max(0, p.material_m2) : m2Sug;
      const baseValor = p.material_m2 !== null ? dinheiro(m2 * preco) : valorSug;
      const valor = p.material_valor !== null ? Math.max(0, p.material_valor) : baseValor;
      res.set(m.chave, {
        ...m.r,
        fracoes,
        material_m2_sugerido: m2Sug,
        material_valor_sugerido: valorSug,
        material_m2: m2,
        material_valor: valor,
        material_unit: valor / m.qtd,
        material_ajustado:
          (p.material_m2 !== null && arred(p.material_m2) !== m2Sug) ||
          (p.material_valor !== null && dinheiro(p.material_valor) !== baseValor),
        grupo,
      });
    });
  }
  return res;
}

/**
 * O que o cliente pode ver da personalização (link e impressão): só a técnica e as
 * medidas da arte — nunca preço por m², material, mão de obra ou ajustes.
 */
export interface PersonalizacaoCliente {
  tecnica: string;
  /** Local da aplicação (tampa, frente…) ou null */
  local: string | null;
  altura_cm: number;
  largura_cm: number;
}

export function personalizacaoParaCliente(
  r: Pick<ResultadoPersonalizacao, 'tecnica_id' | 'tecnica' | 'altura_cm' | 'largura_cm' | 'local'> | null | undefined,
): PersonalizacaoCliente | null {
  if (!r || r.tecnica_id === null || !r.tecnica || !(r.altura_cm && r.altura_cm > 0) || !(r.largura_cm && r.largura_cm > 0)) return null;
  return { tecnica: r.tecnica, local: normalizarLocal(r.local), altura_cm: r.altura_cm, largura_cm: r.largura_cm };
}

/** "Sublimação · arte 10 × 8 cm" (texto para o cliente). */
export function textoPersonalizacaoCliente(p: PersonalizacaoCliente): string {
  const cm = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${p.tecnica}${p.local ? ` (${p.local})` : ''} · arte ${cm(p.altura_cm)} × ${cm(p.largura_cm)} cm`;
}

/** Texto curto para a composição do preço e a folha interna. */
export function descreverPersonalizacao(r: ResultadoPersonalizacao): string {
  const n = (v: number, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: 4 });
  if (r.tecnica_id === null) {
    const ajustes = [r.material_ajustado && 'material ajustado', r.mao_obra_ajustada && 'mão de obra ajustada'].filter(Boolean);
    return ['sem técnica de personalização', ...ajustes].join(' · ');
  }
  const partes = [`${r.tecnica} · arte ${n(r.altura_cm ?? 0, 1)} × ${n(r.largura_cm ?? 0, 1)} cm`, `material ${n(r.material_m2)} m²`];
  if (r.grupo && r.grupo.itens > 1) partes.push(`material rateado entre ${r.grupo.itens} aplicações (${n(r.grupo.material_m2)} m² no total)`);
  if (r.material_ajustado) partes.push('material ajustado');
  if (r.mao_obra_ajustada) partes.push('mão de obra ajustada');
  return partes.join(' · ');
}

// ══════════════════════════════════════════════════════════
// VÁRIAS PERSONALIZAÇÕES POR ITEM (ex.: Corte Laser na tampa + Sublimação no corpo)
// Cada aplicação é calculada como acima; o item soma material e mão de obra de
// todas. Sem nenhuma aplicação, o item é "sem técnica" (valores padrão de Parâmetros).
// ══════════════════════════════════════════════════════════

/** O que o operador informa no item: aplicações (com técnica) ou, sem nenhuma, os valores "sem técnica". */
export interface EntradaPersonalizacao {
  aplicacoes: PersonalizacaoItem[];
  /** Usado só quando não há aplicações: material (R$ do lote) e mão de obra (R$/un); null = padrão */
  sem_tecnica: { material_valor: number | null; mao_obra_unit: number | null };
}

export function entradaVazia(): EntradaPersonalizacao {
  return { aplicacoes: [], sem_tecnica: { material_valor: null, mao_obra_unit: null } };
}

/** Nova aplicação (técnica ainda não escolhida). */
export function aplicacaoVazia(): PersonalizacaoItem {
  return personalizacaoVazia();
}

/** Personalização do item já calculada (gravada no item do orçamento; uso interno). */
export interface PersonalizacaoCalculada {
  /** Uma por aplicação, na ordem (vazio = sem técnica) */
  aplicacoes: ResultadoPersonalizacao[];
  /** Cálculo "sem técnica" (só quando não há aplicações) */
  sem_tecnica: ResultadoPersonalizacao | null;
  /** Totais do item */
  material_valor: number;
  material_unit: number;
  mao_obra_unit: number;
  mao_obra_total: number;
  material_ajustado: boolean;
  mao_obra_ajustada: boolean;
  /** Pendências de todas as aplicações (impede gerar o orçamento) */
  erro: string | null;
  entrada: EntradaPersonalizacao;
}

/** Item do orçamento/carrinho para o cálculo em conjunto com várias aplicações. */
export interface ItemEntradaPersonalizacao<K> {
  chave: K;
  entrada: EntradaPersonalizacao;
  qty: number;
}

const ERRO_SEM_TECNICA = 'Escolha a técnica de personalização.';

/** "aplicação 2 (Sublimação)" — usado nas mensagens de pendência. */
function nomeAplicacao(n: number, r: Pick<ResultadoPersonalizacao, 'tecnica' | 'local'>): string {
  const desc = [r.tecnica, normalizarLocal(r.local)].filter(Boolean).join(' · ');
  return `aplicação ${n}${desc ? ` (${desc})` : ''}`;
}

/** Soma as aplicações (ou usa o "sem técnica") e monta o resultado do item. */
function totalizar(
  entrada: EntradaPersonalizacao,
  aplicacoes: ResultadoPersonalizacao[],
  semTecnica: ResultadoPersonalizacao | null,
): PersonalizacaoCalculada {
  const partes = semTecnica ? [semTecnica] : aplicacoes;
  const erros: string[] = [];
  if (entrada.aplicacoes.length > LIMITE_APLICACOES) erros.push(`No máximo ${LIMITE_APLICACOES} personalizações por item.`);
  aplicacoes.forEach((r, i) => {
    if (r.erro) erros.push(aplicacoes.length > 1 ? `${nomeAplicacao(i + 1, r)}: ${r.erro}` : r.erro);
  });
  return {
    aplicacoes,
    sem_tecnica: semTecnica,
    material_valor: dinheiro(partes.reduce((s, r) => s + r.material_valor, 0)),
    material_unit: partes.reduce((s, r) => s + r.material_unit, 0),
    mao_obra_unit: partes.reduce((s, r) => s + r.mao_obra_unit, 0),
    mao_obra_total: partes.reduce((s, r) => s + r.mao_obra_total, 0),
    material_ajustado: partes.some((r) => r.material_ajustado),
    mao_obra_ajustada: partes.some((r) => r.mao_obra_ajustada),
    erro: erros.length ? erros.join(' ') : null,
    entrada,
  };
}

/** Resultado de uma aplicação ainda sem técnica escolhida (zerado, com pendência). */
function aplicacaoSemTecnica(p: PersonalizacaoItem): ResultadoPersonalizacao {
  return {
    ...calcularPersonalizacao({ ...p, tecnica_id: null, material_valor: 0, mao_obra_unit: 0 }, 1, null),
    entrada: { ...p },
    erro: ERRO_SEM_TECNICA,
  };
}

/**
 * Personalização de todos os itens do orçamento, com várias aplicações por item.
 * O material de cada técnica é somado entre TODAS as aplicações do orçamento (de
 * itens diferentes ou do mesmo item, como frente e verso), arredondado uma vez e
 * rateado pela área; a mão de obra é cobrada por aplicação.
 */
export function calcularPersonalizacoesOrcamento<K>(
  itens: ItemEntradaPersonalizacao<K>[],
  tecnicas: TecnicaComValores[] | null,
  padrao?: PadraoSemTecnica,
): Map<K, PersonalizacaoCalculada> {
  // Aplicações com técnica entram no cálculo em conjunto (chave = item + posição)
  const comTecnica: ItemPersonalizacao<string>[] = [];
  itens.forEach((it, i) =>
    it.entrada.aplicacoes.forEach((a, j) => {
      if (a.tecnica_id !== null) comTecnica.push({ chave: `${i}:${j}`, personalizacao: a, qty: it.qty });
    }),
  );
  const calculadas = calcularPersonalizacaoOrcamento(comTecnica, tecnicas, padrao);

  const res = new Map<K, PersonalizacaoCalculada>();
  itens.forEach((it, i) => {
    const aplicacoes = it.entrada.aplicacoes.map((a, j) =>
      a.tecnica_id === null ? aplicacaoSemTecnica(a) : calculadas.get(`${i}:${j}`)!,
    );
    const semTecnica = it.entrada.aplicacoes.length
      ? null
      : calcularPersonalizacao(
          { ...personalizacaoVazia(), material_valor: it.entrada.sem_tecnica.material_valor, mao_obra_unit: it.entrada.sem_tecnica.mao_obra_unit },
          it.qty,
          tecnicas,
          padrao,
        );
    res.set(it.chave, totalizar(it.entrada, aplicacoes, semTecnica));
  });
  return res;
}

/** Item do orçamento gravado (formatos atual e anteriores). */
interface ItemComPersonalizacao {
  qty: number;
  calc?: { mat_personalizacao?: number; mo_personalizacao?: number };
  personalizacao?: ResultadoPersonalizacao;
  personalizacoes?: PersonalizacaoCalculada;
}

/**
 * Entrada do operador a partir do item gravado, para reabrir no carrinho:
 * formato atual; uma técnica só (versão anterior); ou valores fixos (orçamentos
 * mais antigos, viram "sem técnica" com o que tinham).
 */
export function entradaDoItemOrcamento(item: ItemComPersonalizacao): EntradaPersonalizacao {
  if (item.personalizacoes?.entrada) return item.personalizacoes.entrada;
  const e = item.personalizacao?.entrada;
  if (e && e.tecnica_id !== null) return { ...entradaVazia(), aplicacoes: [{ ...personalizacaoVazia(), ...e }] };
  if (e) return { ...entradaVazia(), sem_tecnica: { material_valor: e.material_valor, mao_obra_unit: e.mao_obra_unit } };
  return {
    ...entradaVazia(),
    sem_tecnica: { material_valor: (item.calc?.mat_personalizacao ?? 0) * item.qty, mao_obra_unit: item.calc?.mo_personalizacao ?? 0 },
  };
}

/** Aplicações com técnica do item gravado (formatos atual e anterior). */
export function aplicacoesDoItemOrcamento(item: Pick<ItemComPersonalizacao, 'personalizacao' | 'personalizacoes'>): ResultadoPersonalizacao[] {
  if (item.personalizacoes) return item.personalizacoes.aplicacoes.filter((r) => r.tecnica_id !== null);
  return item.personalizacao && item.personalizacao.tecnica_id !== null ? [item.personalizacao] : [];
}

/** O que o cliente vê do item: técnica, local e medidas de cada aplicação (sem valores). */
export function personalizacoesParaCliente(item: Pick<ItemComPersonalizacao, 'personalizacao' | 'personalizacoes'>): PersonalizacaoCliente[] {
  return aplicacoesDoItemOrcamento(item)
    .map((r) => personalizacaoParaCliente(r))
    .filter((p): p is PersonalizacaoCliente => p !== null);
}
