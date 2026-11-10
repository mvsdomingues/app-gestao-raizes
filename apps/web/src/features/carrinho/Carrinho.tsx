import { useEffect, useState } from 'react';
import {
  calcComParametros,
  diferencasFaturamento,
  faturamentoPreenchido,
  faturamentoVazio,
  formatBRL,
  montarItemOrcamento,
  type ClienteVinculado,
} from '@raizes/shared';
import { ResumoFaturamento } from '../clientes/FormularioFaturamento';
import { ModalFaturamento } from '../clientes/ModalFaturamento';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { api, ErroApi } from '../../lib/api';
import { precosDoCarrinho, subtotalCarrinho, useCarrinho } from '../../state/carrinho';
import { ItemCarrinho } from './ItemCarrinho';
import { avisar, confirmar, erro } from '../../lib/dialogo';
import { SeletorCliente } from '../clientes/SeletorCliente';

export function Carrinho() {
  const { tela, visitas, irPara, mostrarOrcamento, parametros, tecnicas, carregarParametros } = useApp();
  const { pode, usuario } = useSessao();
  const {
    estado,
    limpar,
    redesenhar,
    definirFrete,
    definirObservacao,
    definirCliente,
    definirEntregaPrevista,
    definirFaturamento,
  } = useCarrinho();
  const { frete, edicao, observacao, cliente, entregaPrevista, faturamento } = estado;
  const [editandoFaturamento, setEditandoFaturamento] = useState(false);
  const temFaturamento = faturamentoPreenchido(faturamento);
  const [gerando, setGerando] = useState(false);

  /** Cliente escolhido: o faturamento do cadastro preenche o do carrinho (pergunta antes de trocar o já digitado). */
  const escolherCliente = async (c: ClienteVinculado | null) => {
    definirCliente(c);
    if (!c) return;
    try {
      const r = await api.faturamentoCliente(c.id);
      if (!faturamentoPreenchido(r.faturamento) || diferencasFaturamento(faturamento, r.faturamento).length === 0) return;
      if (
        temFaturamento &&
        !(await confirmar('O carrinho já tem dados de faturamento. Trocar pelos dados do cadastro deste cliente?', {
          titulo: 'Dados de faturamento',
          ok: 'Usar os do cadastro',
          cancelar: 'Manter os do carrinho',
        }))
      )
        return;
      definirFaturamento(r.faturamento);
    } catch {
      /* sem os dados do cadastro: o carrinho continua como está */
    }
  };

  // Abrir a aba redesenha a lista (reinicia campos e fecha os painéis)
  useEffect(() => {
    if (visitas.carrinho > 0) {
      redesenhar();
      // Tabelas de material e mão de obra atualizadas a cada abertura do carrinho
      void carregarParametros();
    }
  }, [visitas.carrinho]);

  const itens = Object.values(estado.itens);
  const count = itens.length;
  const subtotal = subtotalCarrinho(estado.itens, parametros, tecnicas);
  const valorFrete = Math.max(0, Number.parseFloat(frete) || 0);
  const total = subtotal + valorFrete;
  const unidades = itens.reduce((s, i) => s + i.qty, 0);

  const limparTudo = async () => {
    if (!count && !edicao) return;
    const msg = edicao
      ? `Limpar o carrinho e sair da alteração do ${edicao.numero}?\n\nO orçamento salvo não é modificado.`
      : 'Limpar todos os itens do orçamento?';
    if (!(await confirmar(msg, { titulo: 'Limpar carrinho', ok: 'Limpar', perigo: true }))) return;
    limpar();
  };

  const precos = precosDoCarrinho(estado.itens, parametros, tecnicas);
  const gerarOrcamento = async () => {
    if (!itens.length) {
      void avisar('Adicione produtos ao carrinho antes de gerar o orçamento.', { tipo: 'aviso', titulo: 'Carrinho vazio' });
      return;
    }
    // Cliente obrigatório: todo orçamento nasce ligado a um cliente do cadastro (carteira e comissões)
    if (!cliente) {
      await avisar('Escolha ou inclua o cliente do orçamento.', { tipo: 'aviso', titulo: 'Cliente obrigatório' });
      document.querySelector<HTMLInputElement>('#campo-cliente')?.focus();
      return;
    }
    // Custo de personalização pelas tabelas: cadastro incompleto ou arte sem medidas impedem gerar
    const pendencias = itens
      .map((i) => ({ nome: i.produto.nome ?? i.produto.codigo ?? 'Produto', erro: precos.get(i)!.personalizacao.erro }))
      .filter((x) => x.erro);
    if (pendencias.length) {
      void avisar(
        `Corrija a personalização antes de gerar o orçamento:\n\n${pendencias.map((x) => `• ${x.nome}: ${x.erro}`).join('\n')}`,
        { tipo: 'aviso', titulo: 'Personalização incompleta' },
      );
      return;
    }
    // Imposto de compra, imposto sobre venda e margem: sempre os Parâmetros cadastrados
    const snapshot = itens.map((itemCarrinho) => {
      const { produto, qty, observacao: obsItem } = itemCarrinho;
      const { personalizacao } = precos.get(itemCarrinho)!;
      const item = montarItemOrcamento(produto, qty, calcComParametros(itemCarrinho.calc, parametros), personalizacao);
      // Observação de cada produto vai junto com o item do orçamento
      const obs = obsItem?.trim();
      return obs ? { ...item, observacao: obs } : item;
    });
    const sub = snapshot.reduce((s, i) => s + i.preco * i.qty, 0);
    const tot = sub + valorFrete;

    setGerando(true);
    let numero = '—';
    let id: number | undefined;
    let dataHora = new Date().toISOString();
    const dados = {
      itens: snapshot,
      subtotal: sub,
      frete: valorFrete,
      total: tot,
      observacao: observacao.trim(),
      cliente_id: cliente?.id ?? null,
      entrega_prevista: entregaPrevista || null,
      faturamento: temFaturamento ? faturamento : null,
    };
    try {
      // Alteração de orçamento salvo: mesmo número, data atualizada
      const salvo = edicao ? await api.atualizarOrcamento(edicao.id, dados) : await api.criarOrcamento(dados);
      numero = salvo.numero;
      id = salvo.id;
      dataHora = salvo.data_hora;
      // Orçamento gravado (novo ou alterado): o carrinho é esvaziado
      limpar();
      definirFrete('0');
    } catch (e) {
      // Recusado pelo servidor (orçamento enviado, com pedido ou cliente inválido): mostra o motivo e mantém o carrinho
      if (e instanceof ErroApi && (edicao || e.status === 400)) {
        setGerando(false);
        void avisar(e.message + '\n\nOs itens continuam no carrinho.', { tipo: 'aviso', titulo: 'Alteração não salva' });
        return;
      }
      console.error('Não foi possível salvar o orçamento no histórico:', e);
      void erro(
        'Não foi possível salvar o orçamento no histórico (verifique a conexão com o servidor). O orçamento será exibido, mas não ficará registrado; os itens continuam no carrinho para tentar de novo.',
      );
    } finally {
      setGerando(false);
    }
    // Sem acesso à tela Orçamentos: só confirma que o orçamento foi gravado
    if (!pode('orcamentos')) {
      if (id !== undefined) void avisar(`Orçamento ${numero} gravado.`, { tipo: 'sucesso' });
      return;
    }
    const eu = usuario ? { id: usuario.id, nome: usuario.nome, login: usuario.login } : null;
    mostrarOrcamento({
      id,
      numero,
      dataHora,
      itens: snapshot,
      subtotal: sub,
      frete: valorFrete,
      total: tot,
      observacao: observacao.trim() || null,
      cliente,
      entregaPrevista: entregaPrevista || null,
      // Alteração: o criador original aparece ao reabrir o orçamento pela lista
      ...(edicao ? { alteradoPor: eu } : { responsavel: eu, alteradoPor: null }),
    });
  };

  return (
    <div id="view-carrinho" style={{ display: tela === 'carrinho' ? 'block' : 'none' }}>
      <div className="carrinho-wrap">
        <div className="carrinho-header-bar">
          <div>
            <h2 className="carrinho-page-title">Carrinho de Orçamento</h2>
            <p className="carrinho-page-sub">
              <span id="cart-items-label">
                {count === 0 ? 'Nenhum item adicionado' : `${count} item${count > 1 ? 's' : ''} · ${unidades} unid.`}
              </span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-back" onClick={() => irPara('catalogo')}>
              ← Voltar ao catálogo
            </button>
          </div>
        </div>

        {edicao && (
          <div className="edicao-banner" id="edicao-banner">
            <div>
              <div className="edicao-banner-titulo">
                Alterando o orçamento <span className="orc-num-badge">{edicao.numero}</span>
              </div>
              <div className="edicao-banner-sub">
                Ao salvar, o {edicao.numero} é atualizado (mesmo número, com a data de hoje).
                {edicao.aviso && <span className="edicao-banner-aviso"> {edicao.aviso}</span>}
              </div>
            </div>
            <button className="btn-back" onClick={limparTudo}>
              Cancelar alteração
            </button>
          </div>
        )}

        <div className="carrinho-grid">
          {/* Coluna esquerda: itens */}
          <div className="carrinho-itens-col">
            <div className="cart-items" id="cart-items">
              {count === 0 ? (
                <div className="cart-empty">
                  <div className="cart-empty-icon">✦</div>
                  <p>
                    Adicione produtos ao orçamento
                    <br />
                    clicando no item ou no botão <strong>+</strong>
                  </p>
                </div>
              ) : (
                <ListaItens versao={estado.versao} />
              )}
            </div>
          </div>

          {/* Coluna direita: resumo */}
          <aside className="carrinho-resumo-col">
            <div className="carrinho-resumo">
              <div className="carrinho-resumo-title">Resumo</div>

              <div className="cart-cliente" id="cart-cliente">
                <label className="cart-field-label" htmlFor="campo-cliente">
                  <span>
                    Cliente <span className="obrigatorio">*</span>
                  </span>
                  <span className="cart-cliente-dica">{cliente ? cliente.codigo : 'obrigatório'}</span>
                </label>
                <SeletorCliente id="campo-cliente" valor={cliente} aoMudar={(c) => void escolherCliente(c)} />
              </div>

              <div className="cart-extra-fields">
                <div className="cart-field-row">
                  <span className="cart-field-label">Frete</span>
                  <div className="cart-field-input-wrap">
                    <span className="cart-field-suffix" style={{ marginRight: 2 }}>
                      R$
                    </span>
                    <input
                      className="cart-field-input"
                      id="campo-frete"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0,00"
                      value={frete}
                      onChange={(e) => definirFrete(e.target.value)}
                    />
                  </div>
                </div>
                <div className="cart-field-row">
                  <label className="cart-field-label" htmlFor="campo-entrega">
                    Previsão de entrega
                  </label>
                  <div className="cart-field-input-wrap">
                    <input
                      className="cart-field-input cart-field-data"
                      id="campo-entrega"
                      type="date"
                      value={entregaPrevista}
                      onChange={(e) => definirEntregaPrevista(e.target.value)}
                    />
                  </div>
                </div>
                <div className="cart-faturamento" id="cart-faturamento">
                  <div className="cart-faturamento-topo">
                    <span className="cart-field-label">Faturamento e entrega</span>
                    <button
                      type="button"
                      className="link-botao"
                      id="btn-faturamento-carrinho"
                      onClick={() => setEditandoFaturamento(true)}
                    >
                      {temFaturamento ? 'Alterar' : '+ Informar'}
                    </button>
                  </div>
                  {temFaturamento ? (
                    <ResumoFaturamento dados={faturamento} />
                  ) : (
                    <span className="cart-faturamento-vazio">
                      Opcional — o cliente confirma ou preenche ao aprovar o orçamento.
                    </span>
                  )}
                </div>
                <div className="cart-observacao">
                  <label className="cart-field-label" htmlFor="campo-observacao">
                    Observações
                  </label>
                  <textarea
                    id="campo-observacao"
                    className="custom-input cart-observacao-input"
                    rows={3}
                    maxLength={2000}
                    placeholder="Prazo de entrega, condições de pagamento, detalhes da personalização…"
                    value={observacao}
                    onChange={(e) => definirObservacao(e.target.value)}
                  />
                </div>
              </div>

              <div className="cart-subtotals" id="cart-subtotals">
                {count > 0 && (
                  <>
                    <div className="cart-subtotal-row destaque">
                      <span>Subtotal (preços calculados)</span>
                      <span className="cart-subtotal-val">{formatBRL(subtotal)}</span>
                    </div>
                    <div className={`cart-subtotal-row${valorFrete > 0 ? ' destaque' : ''}`}>
                      <span>Frete de entrega</span>
                      <span className="cart-subtotal-val">+ {formatBRL(valorFrete)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="cart-total-row">
                <span className="cart-total-label">Total Geral</span>
                <span className="cart-total-value" id="cart-total">
                  {formatBRL(total)}
                </span>
              </div>

              <button
                className="btn-primary"
                id="btn-gerar"
                onClick={() => void gerarOrcamento()}
                disabled={count === 0 || gerando}
              >
                {edicao ? `Salvar ${edicao.numero}` : 'Gerar Orçamento'}
              </button>
              <button className="btn-secondary" onClick={() => void limparTudo()}>
                Limpar tudo
              </button>
              <ModalFaturamento
                aberto={editandoFaturamento}
                titulo="Dados de faturamento e entrega"
                subtitulo="Opcional no orçamento. Ao aprovar pelo link, o cliente confirma e completa estes dados (lá eles são obrigatórios)."
                inicial={faturamento}
                completo={false}
                textoSalvar="Usar no orçamento"
                fechar={() => setEditandoFaturamento(false)}
                salvar={(d) => definirFaturamento(d ?? faturamentoVazio(faturamento.tipo_pessoa))}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Lista de itens; a chave inclui a versão para redesenhar tudo quando necessário. */
function ListaItens({ versao }: { versao: number }) {
  const { estado } = useCarrinho();
  return (
    <>
      {Object.values(estado.itens).map((item) => (
        <ItemCarrinho key={`${item.produto.id}-${versao}`} item={item} />
      ))}
    </>
  );
}
