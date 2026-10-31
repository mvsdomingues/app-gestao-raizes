import { useEffect, useState } from 'react';
import { digitos, type Orcamento } from '@raizes/shared';
import { api } from '../../lib/api';
import { avisar, confirmar, erroDe } from '../../lib/dialogo';
import { formatarDataHora } from '../pedidos/comum';

/** Copia texto (também em http, onde a área de transferência do navegador não está disponível). */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = texto;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    return ok;
  }
}

/** Link do WhatsApp com o telefone do cliente (DDI 55 quando falta) e a mensagem pronta. */
export function urlWhatsApp(o: Pick<Orcamento, 'numero' | 'cliente'>, link: string): string {
  const nome = o.cliente?.nome?.split(' ')[0];
  const msg = `Olá${nome ? `, ${nome}` : ''}! Segue o seu orçamento ${o.numero} da Raízes Personalizados: ${link}`;
  let tel = digitos(o.cliente?.telefone ?? '');
  if (tel.length === 10 || tel.length === 11) tel = '55' + tel;
  return `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
}

// ── Janela "link do orçamento" depois de enviar ──
let mostrar: ((o: Orcamento) => void) | null = null;
export function mostrarLinkEnviado(o: Orcamento): void {
  mostrar?.(o);
}

export function ModalLinkEnviado() {
  const [o, setO] = useState<Orcamento | null>(null);
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    mostrar = (x) => {
      setO(x);
      setCopiado(false);
    };
    return () => {
      mostrar = null;
    };
  }, []);
  if (!o?.link) return null;
  const link = o.link.url;
  return (
    <div
      className="custom-modal-backdrop open"
      id="modal-link-enviado"
      onClick={(e) => {
        if (e.target === e.currentTarget) setO(null);
      }}
    >
      <div className="custom-modal-card" role="dialog" aria-modal="true">
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">Orçamento {o.numero} enviado</h3>
          <button className="custom-modal-close" onClick={() => setO(null)} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          Mande este link para {o.cliente?.nome ?? 'o cliente'}. Ele vale até{' '}
          <b>{o.link.valido_ate ? formatarDataHora(o.link.valido_ate) : '—'}</b> e permite aceitar ou rejeitar o orçamento.
        </p>
        <code className="orc-link-url modal-link-url" id="modal-link-url">
          {link}
        </code>
        <div className="modal-link-botoes">
          <button className="btn-back" onClick={() => setO(null)}>
            Fechar
          </button>
          <button
            className="btn-back"
            id="btn-copiar-link-modal"
            onClick={() => void copiarTexto(link).then((ok) => setCopiado(ok))}
          >
            {copiado ? '✓ Copiado' : 'Copiar link'}
          </button>
          {o.cliente?.telefone && (
            <a className="btn-novo" href={urlWhatsApp(o, link)} target="_blank" rel="noreferrer" id="btn-whatsapp-link">
              Enviar pelo WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Painel do link nos detalhes: endereço, validade, visualização e ações. */
export function PainelLink({ orcamento: o, aoAtualizar }: { orcamento: Orcamento; aoAtualizar: (o: Orcamento) => void }) {
  const [copiado, setCopiado] = useState(false);
  const [trocando, setTrocando] = useState(false);
  if (!o.link) return null;
  const { url, enviado_em, valido_ate, visto_em, vencido } = o.link;
  const ativo = o.status === 'ENVIADO';

  const trocar = async () => {
    if (
      !(await confirmar(
        'Gerar um novo link?\n\nO link enviado antes deixa de funcionar na hora; mande o novo para o cliente.',
        { titulo: 'Gerar novo link', ok: 'Gerar novo link', perigo: true },
      ))
    )
      return;
    setTrocando(true);
    try {
      aoAtualizar(await api.trocarLinkOrcamento(o.id));
      setCopiado(false);
      void avisar('Novo link gerado. O anterior não funciona mais.', { tipo: 'sucesso' });
    } catch (e) {
      void erroDe('Não foi possível gerar o novo link.', e);
    } finally {
      setTrocando(false);
    }
  };

  return (
    <div className="orc-link-painel" id="orc-link-painel">
      <div className="orc-link-topo">
        <span className="orc-situacao-rotulo">Link do cliente</span>
        <div className="orc-link-acoes">
          <button className="link-botao" id="btn-copiar-link" onClick={() => void copiarTexto(url).then(setCopiado)}>
            {copiado ? '✓ Copiado' : 'Copiar'}
          </button>
          {ativo && o.cliente?.telefone && (
            <a href={urlWhatsApp(o, url)} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          )}
          <a href={url} target="_blank" rel="noreferrer">
            Abrir ↗
          </a>
          <button className="link-botao" id="btn-novo-link" disabled={trocando} onClick={() => void trocar()}>
            Gerar novo link
          </button>
        </div>
      </div>
      <code className="orc-link-url" id="orc-link-url">
        {url}
      </code>
      <div className="orc-link-meta">
        {enviado_em && <>Enviado em {formatarDataHora(enviado_em)} · </>}
        {valido_ate && (
          <span className={vencido && ativo ? 'vencido' : ''}>
            {vencido ? 'validade encerrada em' : 'válido até'} {formatarDataHora(valido_ate)}
          </span>
        )}
        {' · '}
        {visto_em ? <>aberto pelo cliente em {formatarDataHora(visto_em)}</> : 'ainda não aberto pelo cliente'}
      </div>
    </div>
  );
}
