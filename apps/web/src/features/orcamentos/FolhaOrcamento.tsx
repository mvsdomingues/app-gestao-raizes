import {
  formatarCep,
  formatarDataBr,
  formatarDocumento,
  formatarTelefone,
  aplicacoesDoItemOrcamento,
  personalizacoesParaCliente,
  textoPersonalizacaoCliente,
  type PersonalizacaoCliente,
  type ResultadoPersonalizacao,
  formatBRL,
  resumoDescricao,
  type DadosFaturamento,
  type ItemOrcamento,
  type ParametrosImpressao,
} from '@raizes/shared';
import type { FolhaOrcamento as DadosFolha } from '../../app/contexto';
import { ImagemProduto } from '../../components/ImagemProduto';
import { classeFornecedor } from '../../lib/fornecedor';

/** Linha interna (fora da impressão e do cliente): material usado e ajustes. */
function materialInterno(r: ResultadoPersonalizacao): string {
  const m2 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  const partes = [`Interno: ${r.tecnica}${r.local ? ` (${r.local})` : ''} · material ${m2(r.material_m2)} m²`];
  if (r.grupo && r.grupo.itens > 1) partes.push(`rateado entre ${r.grupo.itens} aplicações (${m2(r.grupo.material_m2)} m² no total)`);
  if (r.material_ajustado) partes.push('material ajustado');
  if (r.mao_obra_ajustada) partes.push('mão de obra ajustada');
  return partes.join(' · ');
}

const cinza = { fontSize: '.82rem', color: '#7A7167' } as const;

/** Dados da folha: os do orçamento interno ou os da página do cliente (sem custos nem fornecedor). */
export type DadosFolhaOrcamento = Pick<DadosFolha, 'id' | 'numero' | 'dataHora' | 'subtotal' | 'frete' | 'total' | 'observacao' | 'cliente' | 'entregaPrevista'> & {
  itens: (Pick<ItemOrcamento, 'nome' | 'codigo' | 'qty' | 'preco' | 'imagem_url'> &
    Partial<Pick<ItemOrcamento, 'fornecedor' | 'origem' | 'personalizacao' | 'personalizacoes'>> & {
      observacao?: string | null;
      descricao?: string | null;
      medidas?: string | null;
      material?: string | null;
      /** Página do cliente: técnica, local e medidas de cada aplicação (sem valores) */
      artes?: PersonalizacaoCliente[];
    })[];
  /** Mockups dos produtos (item = posição na lista; url da imagem) */
  mockups?: { item: number; url: string }[];
  /** Dados de faturamento e entrega (aparecem no início do documento) */
  faturamento?: DadosFaturamento | null;
};

/**
 * Folha timbrada do orçamento (a mesma impressa / salva em PDF), usada nos detalhes
 * do orçamento e do pedido. A composição do preço não aparece em nenhuma delas
 * (fica só na calculadora do carrinho); o fornecedor só na tela interna: fora da
 * impressão (classe "so-tela") e da página do cliente (publico).
 */
export function FolhaOrcamento({
  folha,
  publico = false,
  validoAte,
  impressao,
}: {
  folha: DadosFolhaOrcamento;
  publico?: boolean;
  /** Instruções especiais (só na impressão) e rodapé, da tela Parâmetros › Impressão */
  impressao?: ParametrosImpressao | null;
  /** Data/hora até quando vale (link do cliente); sem ela, "Válido por 7 dias" */
  validoAte?: string | null;
}) {
  const { numero, dataHora, itens, subtotal, frete, total } = folha;
  const d = dataHora ? new Date(dataHora) : new Date();
  const hoje = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // Totais por fornecedor (na ordem em que aparecem)
  const porForn = new Map<string, number>();
  if (!publico) for (const i of itens) porForn.set(i.fornecedor ?? '', (porForn.get(i.fornecedor ?? '') || 0) + i.preco * i.qty);
  const validade = validoAte ? new Date(validoAte).toLocaleDateString('pt-BR') : null;

  return (
    <>
      <div className="orc-letterhead">
        <div>
          <div className="orc-brand-name">Raízes</div>
          <div className="orc-brand-sub">Personalizados</div>
        </div>
        <div className="orc-meta-block">
          <div className="orc-num">{numero}</div>
          <div className="orc-date">
            {hoje} às {hora}
          </div>
          <div className="orc-date">
            {itens.length} produto{itens.length > 1 ? 's' : ''}
          </div>
          {folha.entregaPrevista && (
            <div className="orc-entrega">
              Entrega prevista: <b>{formatarDataBr(folha.entregaPrevista)}</b>
            </div>
          )}
        </div>
      </div>

      {folha.cliente && (
        <div className="orc-cliente" id="orc-cliente">
          <span className="orc-cliente-rotulo">Cliente</span>
          <span className="orc-cliente-nome">{folha.cliente.nome || `Contato #${folha.cliente.id}`}</span>
          {folha.cliente.telefone && <span className="orc-cliente-tel">{formatarTelefone(folha.cliente.telefone)}</span>}
        </div>
      )}

      {folha.faturamento && <BlocoFaturamento d={folha.faturamento} />}

      <div className="orc-totals-block">
        <div>
          <div className="orc-grand-label">Total Geral</div>
          <div className="orc-grand-total">{formatBRL(total)}</div>
        </div>
        <div className="orc-by-supplier">
          {[...porForn].map(([f, v]) => (
            <div className="orc-sup-item so-tela" key={f}>
              <label>{f}</label>
              <span>{formatBRL(v)}</span>
            </div>
          ))}
          <div className={`orc-sup-item${publico ? '' : ' so-impressao'}`}>
            <label>Subtotal</label>
            <span>{formatBRL(subtotal)}</span>
          </div>
          {frete > 0 && (
            <div className="orc-sup-item">
              <label>Frete</label>
              <span>{formatBRL(frete)}</span>
            </div>
          )}
        </div>
      </div>

      <table className="orc-table">
        <thead>
          <tr>
            <th style={{ width: 32 }}>#</th>
            <th>Produto</th>
            <th className="num" style={{ width: 60 }}>
              Qtd.
            </th>
            <th className="num" style={{ width: 110 }}>
              Vlr. Unit.
            </th>
            <th className="num" style={{ width: 120 }}>
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item, idx) => (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td>
                <div className="orc-prod-cell">
                  <ImagemProduto url={item.imagem_url} className="orc-prod-img" alt={item.nome} classeVazia="orc-prod-no-img" />
                  <div>
                    <div>
                      {item.nome}
                      {!publico && item.fornecedor && (
                        <span className={`orc-sup-badge so-tela ${classeFornecedor(item.fornecedor, item.origem, 'orc-sup-')}`}>
                          {item.fornecedor}
                        </span>
                      )}
                    </div>
                    <div className="orc-prod-code">Cód: {item.codigo || '–'}</div>
                    {item.descricao && <div className="orc-prod-desc">{resumoDescricao(item.descricao)}</div>}
                    {/* Técnica, local e medidas de cada aplicação: para todos (tela, impressão e cliente), sem valores */}
                    {(item.artes ?? personalizacoesParaCliente(item)).map((arte, n) => (
                      <div className="orc-prod-ficha orc-prod-arte" key={`arte-${n}`}>
                        <span>
                          <b>Personalização:</b> {textoPersonalizacaoCliente(arte)}
                        </span>
                      </div>
                    ))}
                    {!publico &&
                      aplicacoesDoItemOrcamento(item).map((r, n) => (
                        <div
                          key={`int-${n}`}
                          className="orc-prod-pers so-tela"
                          title="Só na tela interna (não sai na impressão nem para o cliente)"
                        >
                          {materialInterno(r)}
                        </div>
                      ))}
                    {(item.medidas || item.material) && (
                      <div className="orc-prod-ficha">
                        {item.medidas && (
                          <span>
                            <b>Medidas:</b> {item.medidas}
                          </span>
                        )}
                        {item.material && (
                          <span>
                            <b>Material:</b> {item.material}
                          </span>
                        )}
                      </div>
                    )}
                    {item.observacao && (
                      <div className="orc-prod-obs">
                        <span>Obs.:</span> {item.observacao}
                      </div>
                    )}
                  </div>
                </div>
              </td>
              <td className="num">{item.qty}</td>
              <td className="num">{formatBRL(item.preco)}</td>
              <td className="num" style={{ fontWeight: 600 }}>
                {formatBRL(item.preco * item.qty)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: '1px solid #E5E0D8' }}>
            <td colSpan={4} style={{ padding: '8px 12px', ...cinza, textAlign: 'right' }}>
              Subtotal
            </td>
            <td className="num" style={{ padding: '8px 12px', ...cinza }}>
              {formatBRL(subtotal)}
            </td>
          </tr>
          <tr>
            <td colSpan={4} style={{ padding: '6px 12px', ...cinza, textAlign: 'right' }}>
              Frete de entrega
            </td>
            <td className="num" style={{ padding: '6px 12px', ...cinza }}>
              + {formatBRL(frete)}
            </td>
          </tr>
          <tr className="total-row">
            <td colSpan={4}>TOTAL GERAL</td>
            <td className="num">{formatBRL(total)}</td>
          </tr>
        </tfoot>
      </table>

      {(folha.mockups?.length ?? 0) > 0 && (
        <section className="orc-mockups" id="orc-mockups">
          <div className="orc-mockups-titulo">Mockups dos produtos</div>
          <div className="orc-mockups-grade">
            {folha.mockups!
              .filter((m) => itens[m.item])
              .map((m) => (
                <figure key={m.item} className="orc-mockup">
                  <img src={m.url} alt={`Mockup: ${itens[m.item]!.nome}`} loading="lazy" />
                  <figcaption>
                    <span className="orc-mockup-num">{m.item + 1}</span> {itens[m.item]!.nome}
                    {itens[m.item]!.codigo && <span className="orc-mockup-cod"> · Cód: {itens[m.item]!.codigo}</span>}
                  </figcaption>
                </figure>
              ))}
          </div>
        </section>
      )}

      {folha.observacao && (
        <div className="orc-observacoes" id="orc-observacoes">
          <div className="orc-observacoes-titulo">Observações</div>
          <div className="orc-observacoes-texto">{folha.observacao}</div>
        </div>
      )}

      {impressao?.instrucoes_especiais && (
        // Interno: só na impressão; na página do cliente aparece também na tela
        <section className={`orc-instrucoes${publico ? '' : ' so-impressao'}`} id="orc-instrucoes">
          <div className="orc-observacoes-titulo">Instruções especiais</div>
          <div className="orc-instrucoes-texto">{impressao.instrucoes_especiais}</div>
        </section>
      )}

      {impressao?.rodape && (
        <div className="orc-rodape-texto" id="orc-rodape">
          {impressao.rodape}
        </div>
      )}

      {/* Assinatura e validade: sempre a última linha do documento */}
      <div className={`orc-footer${impressao?.rodape ? ' apos-rodape' : ''}`}>
        <div className="orc-footer-brand">Raízes Personalizados</div>
        <span>{validade ? `Válido até ${validade}` : 'Válido por 7 dias'} · sujeito à disponibilidade de estoque</span>
      </div>
    </>
  );
}

/** Dados de faturamento e entrega no início da folha. */
function BlocoFaturamento({ d }: { d: DadosFaturamento }) {
  const rua = [d.logradouro, d.numero].filter(Boolean).join(', ');
  const cidade = [d.cidade, d.uf].filter(Boolean).join('/');
  const endereco = [rua, d.complemento, d.bairro].filter(Boolean).join(' – ');
  return (
    <section className="orc-faturamento" id="orc-faturamento-folha">
      <div className="orc-faturamento-col">
        <span className="orc-cliente-rotulo">Faturamento</span>
        <span className="orc-faturamento-nome">{d.nome || '—'}</span>
        {d.documento && (
          <span>
            {d.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} {formatarDocumento(d.documento)}
          </span>
        )}
        {(d.contato || d.email) && <span>{[d.contato, d.email].filter(Boolean).join(' · ')}</span>}
      </div>
      {(endereco || cidade || d.cep) && (
        <div className="orc-faturamento-col">
          <span className="orc-cliente-rotulo">Endereço de entrega</span>
          {endereco && <span>{endereco}</span>}
          {(cidade || d.cep) && <span>{[cidade, d.cep ? `CEP ${formatarCep(d.cep)}` : ''].filter(Boolean).join(' · ')}</span>}
        </div>
      )}
    </section>
  );
}
