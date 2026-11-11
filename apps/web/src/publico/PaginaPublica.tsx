import { Logo } from '../components/Logo';
import { useEffect, useState } from 'react';
import {
  faturamentoVazio,
  formatBRL,
  normalizarFaturamento,
  validarFaturamento,
  type CampoFaturamento,
  type DadosFaturamento,
  type OrcamentoPublico,
} from '@raizes/shared';
import { FormularioFaturamento } from '../features/clientes/FormularioFaturamento';
import { FolhaOrcamento } from '../features/orcamentos/FolhaOrcamento';

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'ok'; o: OrcamentoPublico };
type Painel = null | 'aceitar' | 'recusar';

const codigo = decodeURIComponent(location.pathname.replace(/^\/o\//, '').replace(/\/+$/, ''));
const API = `/api/publico/orcamentos/${encodeURIComponent(codigo)}`;

async function pedir(url: string, corpo?: unknown): Promise<OrcamentoPublico> {
  const r = await fetch(url, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: corpo === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    credentials: 'omit',
  });
  const dados = (await r.json().catch(() => ({}))) as OrcamentoPublico & { erro?: string };
  if (!r.ok) throw Object.assign(new Error(dados.erro || `Erro ${r.status}`), { status: r.status });
  return dados;
}

function dataHora(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Página do cliente: orçamento (como a folha impressa) + aceitar ou recusar. */
export function PaginaPublica() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' });
  const [painel, setPainel] = useState<Painel>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [fat, setFat] = useState<DadosFaturamento>(faturamentoVazio());
  const [errosFat, setErrosFat] = useState<Partial<Record<CampoFaturamento, string>>>({});

  useEffect(() => {
    pedir(API).then(
      (o) => {
        setEstado({ tipo: 'ok', o });
        document.title = `Orçamento ${o.numero} · Raízes Personalizados`;
      },
      (e: Error & { status?: number }) =>
        setEstado({
          tipo: 'erro',
          mensagem: e.status === 404 ? 'Este link é inválido ou não está mais disponível.' : e.message,
        }),
    );
  }, []);

  if (estado.tipo === 'carregando') return <div className="pub-msg">Carregando o orçamento…</div>;
  if (estado.tipo === 'erro') {
    return (
      <div className="pub-wrap">
        <Marca />
        <div className="pub-cartao pub-erro" id="pub-erro">
          <h1>Link indisponível</h1>
          <p>{estado.mensagem}</p>
          <p>Se precisar do orçamento, fale com a Raízes Personalizados.</p>
        </div>
      </div>
    );
  }

  const o = estado.o;
  const abrir = (p: Painel) => {
    setPainel(p);
    setTexto('');
    setAviso('');
    setErrosFat({});
    // Aceite: dados de faturamento já informados pela Raízes vêm preenchidos para o cliente conferir
    if (p === 'aceitar') setFat(o.faturamento ?? faturamentoVazio());
  };

  const responder = async () => {
    if (painel === 'recusar' && texto.trim().length < 5) {
      setAviso('Conte para nós o motivo (pelo menos 5 caracteres).');
      return;
    }
    let faturamento: DadosFaturamento | null = null;
    if (painel === 'aceitar') {
      faturamento = normalizarFaturamento(fat);
      const erros = validarFaturamento(faturamento ?? fat, true);
      setErrosFat(erros);
      if (Object.keys(erros).length) {
        setAviso('Preencha os dados de faturamento e entrega destacados para confirmar o aceite.');
        document.getElementById('pub-faturamento')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    setEnviando(true);
    setAviso('');
    try {
      const novo =
        painel === 'aceitar'
          ? await pedir(`${API}/aceitar`, { observacao: texto, faturamento })
          : await pedir(`${API}/recusar`, { motivo: texto });
      setEstado({ tipo: 'ok', o: novo });
      setPainel(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      // Situação mudou (respondido em outra aba, em revisão…): recarrega e mostra o motivo
      setAviso(e instanceof Error ? e.message : String(e));
      pedir(API).then(
        (x) => setEstado({ tipo: 'ok', o: x }),
        () => {},
      );
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pub-wrap">
      <Situacao o={o} />

      <div className="pub-folha orcamento-sheet-full" id="pub-folha">
        <FolhaOrcamento
          publico
          ampliarImagens
          validoAte={o.valido_ate}
          folha={{
            numero: o.numero,
            dataHora: o.data_hora,
            subtotal: o.subtotal,
            frete: o.frete,
            total: o.total,
            observacao: o.observacao,
            entregaPrevista: o.entrega_prevista,
            cliente: o.cliente ? { id: 0, nome: o.cliente.nome, telefone: o.cliente.telefone } : null,
            itens: o.itens.map(({ personalizacoes, ...i }) => ({
              ...i,
              artes: personalizacoes ?? [],
              imagem_url: i.imagem ?? '',
            })),
            mockups: (o.mockups ?? []).map((m) => ({ item: m.item, url: m.imagem })),
            faturamento: o.faturamento,
          }}
          impressao={o.impressao}
        />
      </div>

      <div className="pub-acoes" id="pub-acoes">
        <button className="pub-btn pub-btn-sec" onClick={() => window.print()}>
          Imprimir / Salvar PDF
        </button>
        {o.situacao === 'DISPONIVEL' && painel === null && (
          <div className="pub-resposta-botoes">
            <button className="pub-btn pub-btn-recusar" id="pub-recusar" onClick={() => abrir('recusar')}>
              Rejeitar
            </button>
            <button className="pub-btn pub-btn-aceitar" id="pub-aceitar" onClick={() => abrir('aceitar')}>
              Aceitar orçamento
            </button>
          </div>
        )}
      </div>

      {painel && (
        <div className={`pub-cartao pub-painel ${painel}`} id="pub-painel">
          <h2>{painel === 'aceitar' ? 'Confirmar o aceite' : 'Rejeitar o orçamento'}</h2>
          <p>
            {painel === 'aceitar' ? (
              <>
                Você está aceitando o orçamento <b>{o.numero}</b>, no total de <b>{formatBRL(o.total)}</b>. A Raízes
                Personalizados recebe o pedido na hora e entra em contato para os próximos passos.
              </>
            ) : (
              <>
                Conte para nós o motivo. Se precisar de alterações, detalhe aqui o que deve mudar (quantidades, produtos, cores,
                prazo…) e a Raízes envia um orçamento revisado.
              </>
            )}
          </p>
          {painel === 'aceitar' && (
            <section className="pub-faturamento" id="pub-faturamento">
              <h3>Dados para faturamento e entrega</h3>
              <p className="pub-faturamento-sub">
                Confira e complete os dados abaixo — eles serão usados na nota fiscal e na entrega do pedido.
              </p>
              <FormularioFaturamento
                valor={fat}
                mudar={(v) => {
                  setFat(v);
                  if (Object.keys(errosFat).length) {
                    const e = validarFaturamento(normalizarFaturamento(v) ?? v, true);
                    setErrosFat(e);
                    if (!Object.keys(e).length) setAviso('');
                  }
                }}
                erros={errosFat}
                obrigatorio
                prefixo="pub-fat"
              />
            </section>
          )}
          <label htmlFor="pub-texto">{painel === 'aceitar' ? 'Observação (opcional)' : 'Motivo ou alterações necessárias'}</label>
          <textarea
            id="pub-texto"
            className="custom-input"
            rows={4}
            maxLength={1000}
            autoFocus={painel === 'recusar'}
            placeholder={
              painel === 'aceitar'
                ? 'Ex.: entregar na portaria, ajuste de data…'
                : 'Ex.: trocar a cor da caneca para azul e aumentar para 150 unidades; ou: prazo, valor…'
            }
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {aviso && (
            <div className="pub-aviso" id="pub-aviso">
              {aviso}
            </div>
          )}
          <div className="pub-painel-botoes">
            <button className="pub-btn pub-btn-sec" onClick={() => setPainel(null)} disabled={enviando}>
              Voltar
            </button>
            <button
              className={`pub-btn ${painel === 'aceitar' ? 'pub-btn-aceitar' : 'pub-btn-recusar'}`}
              id="pub-confirmar"
              onClick={() => void responder()}
              disabled={enviando}
            >
              {enviando ? 'Enviando…' : painel === 'aceitar' ? 'Confirmar aceite' : 'Confirmar rejeição'}
            </button>
          </div>
        </div>
      )}
      {!painel && aviso && <div className="pub-cartao pub-aviso">{aviso}</div>}

      <footer className="pub-rodape">Raízes Personalizados · este link é pessoal; não o compartilhe.</footer>
    </div>
  );
}

function Marca() {
  return (
    <div className="pub-marca">
      <Logo className="orc-brand-logo" />
    </div>
  );
}

/** Faixa no topo com a situação do orçamento e a resposta do cliente. */
function Situacao({ o }: { o: OrcamentoPublico }) {
  const r = o.resposta;
  const validade = o.valido_ate ? new Date(o.valido_ate).toLocaleDateString('pt-BR') : null;
  const conteudo: Record<OrcamentoPublico['situacao'], { classe: string; titulo: string; texto: string }> = {
    DISPONIVEL: {
      classe: 'info',
      titulo: `Orçamento ${o.numero}${o.cliente ? ` para ${o.cliente.nome}` : ''}`,
      texto: `Confira os itens abaixo e responda no fim da página${validade ? ` até ${validade}` : ''}.`,
    },
    VENCIDO: {
      classe: 'aviso',
      titulo: 'Validade encerrada',
      texto: `Este orçamento valia até ${validade}. Fale com a Raízes para atualizá-lo.`,
    },
    EM_REVISAO: {
      classe: 'aviso',
      titulo: 'Orçamento em revisão',
      texto: 'A Raízes está ajustando este orçamento. Você receberá a nova versão em breve.',
    },
    ACEITO: {
      classe: 'ok',
      titulo: r ? 'Obrigado! Orçamento aceito' : 'Orçamento confirmado',
      texto: `${r ? `Aceito em ${dataHora(r.em)}. ` : ''}${o.pedido ? `Seu pedido é o ${o.pedido}. ` : ''}A Raízes entrará em contato para os próximos passos.`,
    },
    RECUSADO: {
      classe: 'neutro',
      titulo: 'Orçamento recusado',
      texto: `${r ? `Recusado em ${dataHora(r.em)}${r.observacao ? ` · motivo: ${r.observacao}` : ''}. ` : ''}Obrigado pelo retorno.`,
    },
    CANCELADO: {
      classe: 'neutro',
      titulo: 'Orçamento cancelado',
      texto: 'Este orçamento foi cancelado pela Raízes Personalizados.',
    },
  };
  const c = conteudo[o.situacao];
  return (
    <div className={`pub-situacao ${c.classe}`} id="pub-situacao" data-situacao={o.situacao}>
      <div className="pub-situacao-titulo">{c.titulo}</div>
      <div className="pub-situacao-texto">{c.texto}</div>
      {o.situacao === 'DISPONIVEL' && (
        <div className="pub-situacao-alteracao" id="pub-dica-alteracao">
          <b>Precisa mudar alguma coisa?</b> Use o botão <b>Rejeitar</b> no fim da página e descreva no campo de motivo as
          alterações necessárias (quantidades, produtos, cores, prazo…). A Raízes ajusta o orçamento e envia a nova versão.
        </div>
      )}
    </div>
  );
}
