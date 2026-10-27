import { useState } from 'react';
import type { ItemOrcamento, Orcamento, ParametrosCalculo } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { useCarrinho, type ItemCarrinho, type Itens } from '../../state/carrinho';

/** Ids dos itens que não estão mais no catálogo (bem abaixo dos ids de produtos próprios). */
const BASE_ID_FORA_CATALOGO = -1_000_000_000;

/** "custo base R$ 1.234,56 + …" → 1234.56 (orçamentos gravados antes da edição). */
function custoDaComposicao(composicao: string): number | null {
  const m = /custo base R\$\s?([\d.]+,\d{2})/.exec(composicao.replace(/ /g, ' '));
  return m ? Number(m[1]!.replace(/\./g, '').replace(',', '.')) : null;
}

/**
 * Localiza o produto no catálogo atual pelo fornecedor + código, para que o item
 * continue ligado ao catálogo (cartão marcado, mockup etc.). Os ids dos fornecedores
 * mudam a cada atualização da base, por isso a busca é pelo código.
 */
async function localizarNoCatalogo(item: ItemOrcamento): Promise<number | null> {
  if (!item.codigo) return null;
  try {
    const r = await api.produtos({ q: item.codigo, fornecedor: item.fornecedor, estoque: false, limit: 80, offset: 0 });
    return r.produtos.find((p) => p.codigo === item.codigo)?.id ?? null;
  } catch {
    return null;
  }
}

/** Converte os itens de um orçamento salvo em itens do carrinho. */
async function montarItensCarrinho(
  o: Orcamento,
  parametros: ParametrosCalculo,
): Promise<{ itens: Itens; semAjustes: boolean }> {
  const ids = await Promise.all(o.itens.map(localizarNoCatalogo));
  const usados = new Set<number>();
  const itens: Itens = {};
  let semAjustes = false;

  o.itens.forEach((item, i) => {
    let id = ids[i];
    if (id === null || id === undefined || usados.has(id)) id = BASE_ID_FORA_CATALOGO - i;
    usados.add(id);

    const custo = item.custo ?? custoDaComposicao(item.composicao) ?? 0;
    if (!item.calc) semAjustes = true;
    const linha: ItemCarrinho = {
      produto: {
        id,
        origem: item.origem ?? 'fornecedor',
        nome: item.nome,
        fornecedor: item.fornecedor,
        codigo: item.codigo,
        imagem_url: item.imagem_url,
        preco: custo, // custo gravado no orçamento (não o custo atual do fornecedor)
      },
      qty: item.qty,
      calc: { ...parametros, ...(item.calc ?? {}) },
    };
    itens[id] = linha;
  });
  return { itens, semAjustes };
}

/**
 * Ação "Editar" de um orçamento salvo: exige carrinho vazio, carrega os itens
 * e o frete no carrinho e abre a tela do carrinho em modo de alteração.
 */
export function useEditarOrcamento() {
  const { irPara, parametros } = useApp();
  const { estado, carregarOrcamento } = useCarrinho();
  const [carregando, setCarregando] = useState<number | null>(null);

  const editar = async (id: number, numero: string) => {
    const qtd = Object.keys(estado.itens).length;
    if (qtd > 0 || estado.edicao) {
      const atual = estado.edicao ? ` (alteração do ${estado.edicao.numero} em andamento)` : '';
      if (
        confirm(
          `O carrinho tem ${qtd} ${qtd === 1 ? 'item' : 'itens'}${atual}.\n\n` +
            `Para alterar o ${numero}, esvazie o carrinho primeiro (botão "Limpar tudo").\n\n` +
            'Ir para o carrinho agora?',
        )
      ) {
        irPara('carrinho');
      }
      return;
    }
    setCarregando(id);
    try {
      const o = await api.orcamento(id);
      if (o.pedido) {
        alert(
          `O ${o.numero} está atrelado ao pedido ${o.pedido.codigo} e não pode ser alterado.\n\n` +
            'Para alterá-lo, cancele o pedido na tela Pedidos.',
        );
        return;
      }
      const { itens, semAjustes } = await montarItensCarrinho(o, parametros);
      carregarOrcamento(itens, String(o.frete || 0), {
        id: o.id,
        numero: o.numero,
        aviso: semAjustes
          ? 'Orçamento gravado antes desta versão: os custos de personalização e fixos foram preenchidos com os Parâmetros atuais — confira os valores.'
          : undefined,
      });
      irPara('carrinho');
    } catch (e) {
      console.error(e);
      alert('Não foi possível carregar este orçamento para alteração.');
    } finally {
      setCarregando(null);
    }
  };

  return { editar, carregando };
}
