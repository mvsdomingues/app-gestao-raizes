import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  LIMITES_SOLICITACAO,
  TIPOS_ARQUIVO_SOLICITACAO,
  urlFotoProduto,
  type NovaSolicitacaoSite,
  type RespostaArquivoSite,
  type RespostaNovaSolicitacaoSite,
  type SolicitanteSite,
} from '@raizes/contrato-site';
import { Aviso, Foto } from '../componentes/Basicos';
import { definirTitulo, useSite } from '../contexto';
import { useLista, type ItemLista } from '../lista';
import { Link } from '../rota';
import { linkWhatsApp } from '../whatsapp';

const VAZIO: SolicitanteSite = { nome: '', empresa: '', documento: '', telefone: '', email: '', prazo: '', cep: '', mensagem: '' };
const CHAVE_DADOS = 'site:dados-contato:v1';

/** Revisão da lista e envio da solicitação de cotação. */
export function Cotacao() {
  const site = useSite();
  const { itens, alterar, remover, limpar, abrir } = useLista();
  const [dados, setDados] = useState<SolicitanteSite>(() => {
    try {
      return { ...VAZIO, ...(JSON.parse(sessionStorage.getItem(CHAVE_DADOS) ?? '{}') as Partial<SolicitanteSite>) };
    } catch {
      return VAZIO;
    }
  });
  const [aceite, setAceite] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const reiniciarCaptcha = useRef<() => void>(() => undefined);

  useEffect(() => definirTitulo('Solicitar cotação'), []);
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE_DADOS, JSON.stringify({ ...dados, mensagem: '' }));
    } catch {
      /* sem armazenamento */
    }
  }, [dados]);

  if (codigo) {
    const wpp = linkWhatsApp(site.geral, `Olá! Acabei de enviar a solicitação de cotação ${codigo} pelo site.`);
    return (
      <div className="largura-texto pagina enviado">
        <p className="sobretitulo">Solicitação enviada</p>
        <h1>Recebemos o seu pedido de cotação</h1>
        <p className="codigo-grande">{codigo}</p>
        <p>
          Guarde este código. A nossa equipe vai conferir os produtos e a personalização e responder com a cotação pelo contato que
          você informou{site.geral.horario ? ` (${site.geral.horario})` : ''}.
        </p>
        <div className="acoes">
          <Link href="/produtos" className="botao">
            Continuar no site
          </Link>
          {wpp && (
            <a className="botao botao-contorno" href={wpp} target="_blank" rel="noopener noreferrer">
              Avisar pelo WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!itens.length) {
    return (
      <Aviso titulo="Sua lista de cotação está vazia">
        <p>Escolha os produtos e as quantidades. No fim, você envia tudo de uma vez.</p>
        <Link href="/produtos" className="botao">
          Ver produtos
        </Link>
      </Aviso>
    );
  }

  const campo = (k: keyof SolicitanteSite, v: string) => setDados((d) => ({ ...d, [k]: v }));
  const abaixo = itens.filter((i) => i.quantidade < i.minimo);
  const privacidade = site.paginas.some((p) => p.chave === 'privacidade');

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    if (abaixo.length) return setErro(`Ajuste a quantidade de ${abaixo[0]!.nome}: o mínimo é ${abaixo[0]!.minimo}.`);
    if (!aceite) return setErro('Para enviar, concorde com o aviso de privacidade.');
    if (site.captcha_chave && !captcha) return setErro('Confirme que você não é um robô.');
    const corpo: NovaSolicitacaoSite = {
      solicitante: dados,
      itens: itens.map((i) => ({
        codigo: i.codigo,
        cor: i.cor,
        quantidade: i.quantidade,
        personalizacao: i.personalizacao,
        observacao: i.observacao,
        arquivo: i.arquivo?.id ?? null,
      })),
      aceite_privacidade: true,
      captcha,
    };
    setEnviando(true);
    try {
      const r = await fetch('/api/v1/solicitacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const j = (await r.json().catch(() => ({}))) as RespostaNovaSolicitacaoSite & { erro?: string };
      if (!r.ok) throw new Error(j.erro || 'Não foi possível enviar. Tente de novo.');
      limpar();
      setCodigo(j.codigo);
      window.scrollTo({ top: 0 });
    } catch (er) {
      setErro(er instanceof Error && er.message !== 'Failed to fetch' ? er.message : 'Sem conexão. Confira a internet e tente de novo.');
      setCaptcha('');
      reiniciarCaptcha.current();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="cotacao largura" onSubmit={enviar} noValidate>
      <nav className="trilha" aria-label="Você está em">
        <Link href="/">Início</Link> <span>›</span> Solicitar cotação
      </nav>
      <h1>Solicitar cotação</h1>
      <p className="cotacao-intro">
        Confira os produtos, conte como quer a personalização e envie. A cotação chega com os preços já com a sua marca.
      </p>

      <div className="cotacao-grade">
        <section className="cotacao-itens" aria-label="Produtos">
          {itens.map((i) => (
            <ItemCotacao key={i.uid} i={i} alterar={(m) => alterar(i.uid, m)} remover={() => remover(i.uid)} />
          ))}
          <div className="cotacao-mais">
            <button type="button" className="link-botao" onClick={abrir}>
              Ver a lista
            </button>
            ·
            <Link href="/produtos" className="link-botao">
              Incluir mais produtos
            </Link>
          </div>
        </section>

        <section className="cotacao-dados" aria-label="Seus dados">
          <h2>Seus dados</h2>
          <div className="campos">
            <Campo rotulo="Nome" obrigatorio valor={dados.nome} aoMudar={(v) => campo('nome', v)} auto="name" />
            <Campo rotulo="Empresa" valor={dados.empresa} aoMudar={(v) => campo('empresa', v)} auto="organization" />
            <Campo rotulo="WhatsApp ou telefone" obrigatorio tipo="tel" valor={dados.telefone} aoMudar={(v) => campo('telefone', v)} auto="tel" dica="Com DDD" />
            <Campo rotulo="E-mail" obrigatorio tipo="email" valor={dados.email} aoMudar={(v) => campo('email', v)} auto="email" />
            <Campo rotulo="CNPJ ou CPF" valor={dados.documento} aoMudar={(v) => campo('documento', v)} dica="Opcional" />
            <Campo rotulo="CEP de entrega" valor={dados.cep} aoMudar={(v) => campo('cep', v)} auto="postal-code" dica="Ajuda a calcular o frete" />
            <Campo rotulo="Para quando precisa?" tipo="date" valor={dados.prazo} aoMudar={(v) => campo('prazo', v)} dica="Opcional" />
          </div>
          <label className="campo">
            <span>Mensagem (opcional)</span>
            <textarea
              rows={3}
              maxLength={LIMITES_SOLICITACAO.mensagem}
              value={dados.mensagem}
              onChange={(e) => campo('mensagem', e.target.value)}
              placeholder="Ocasião, público, orçamento previsto, dúvidas…"
            />
          </label>
          <label className="aceite">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>
              Concordo com o uso destes dados para responder a minha cotação
              {privacidade ? (
                <>
                  {' '}
                  (veja o{' '}
                  <a href="/privacidade" target="_blank" rel="noopener">
                    aviso de privacidade
                  </a>
                  ).
                </>
              ) : (
                '.'
              )}
            </span>
          </label>
          {site.captcha_chave && <Captcha chave={site.captcha_chave} aoResolver={setCaptcha} reiniciar={reiniciarCaptcha} />}
          {erro && (
            <p className="erro-envio" role="alert">
              {erro}
            </p>
          )}
          <button type="submit" className="botao botao-grande" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar solicitação'}
          </button>
        </section>
      </div>
    </form>
  );
}

function Campo({
  rotulo,
  valor,
  aoMudar,
  tipo = 'text',
  obrigatorio,
  auto,
  dica,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  tipo?: string;
  obrigatorio?: boolean;
  auto?: string;
  dica?: string;
}) {
  return (
    <label className="campo">
      <span>
        {rotulo}
        {obrigatorio && <b aria-hidden="true"> *</b>}
        {dica && <small> · {dica}</small>}
      </span>
      <input type={tipo} required={obrigatorio} autoComplete={auto} value={valor} onChange={(e) => aoMudar(e.target.value)} />
    </label>
  );
}

function ItemCotacao({ i, alterar, remover }: { i: ItemLista; alterar: (m: Partial<ItemLista>) => void; remover: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erroArquivo, setErroArquivo] = useState('');
  const baixa = i.quantidade < i.minimo;

  const enviarArquivo = async (f: File | undefined) => {
    if (!f) return;
    setErroArquivo('');
    if (!TIPOS_ARQUIVO_SOLICITACAO[f.type]) return setErroArquivo('Envie o logo em PNG, JPG, WEBP ou PDF.');
    if (f.size > LIMITES_SOLICITACAO.bytes_arquivo) return setErroArquivo('O arquivo deve ter no máximo 10 MB.');
    setEnviando(true);
    try {
      const r = await fetch('/api/v1/arquivos', {
        method: 'POST',
        headers: { 'Content-Type': f.type, 'X-Nome-Arquivo': encodeURIComponent(f.name) },
        body: f,
      });
      const j = (await r.json().catch(() => ({}))) as RespostaArquivoSite & { erro?: string };
      if (!r.ok) throw new Error(j.erro || 'Não foi possível enviar o arquivo.');
      alterar({ arquivo: { id: j.id, nome: j.nome } });
    } catch (e) {
      setErroArquivo(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Sem conexão para enviar o arquivo.');
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  return (
    <article className="item-cotacao">
      <div className="item-topo">
        <Foto src={i.fotos ? urlFotoProduto(i.codigo, i.foto, 'p') : null} alt="" />
        <div>
          <Link href={`/produtos/${i.slug}`} className="item-nome">
            {i.nome}
          </Link>
          <span className="item-cor">
            {i.cor_nome ? `Cor: ${i.cor_nome}` : 'Cor a definir'} · {i.codigo}
          </span>
        </div>
        <button type="button" className="remover" aria-label={`Tirar ${i.nome}`} onClick={remover}>
          ✕
        </button>
      </div>
      <div className="item-campos">
        <label className="campo campo-qtd">
          <span>Quantidade</span>
          <input
            type="number"
            inputMode="numeric"
            min={i.minimo}
            aria-invalid={baixa}
            value={i.quantidade || ''}
            onChange={(e) => alterar({ quantidade: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
          <small className={baixa ? 'alerta-minimo' : ''}>mínimo {i.minimo.toLocaleString('pt-BR')}</small>
        </label>
        <label className="campo">
          <span>Personalização</span>
          <input
            maxLength={LIMITES_SOLICITACAO.texto_item}
            placeholder="Ex.: logo na frente, 5 × 3 cm, 1 cor"
            value={i.personalizacao}
            onChange={(e) => alterar({ personalizacao: e.target.value })}
          />
        </label>
        <label className="campo">
          <span>Observação</span>
          <input maxLength={LIMITES_SOLICITACAO.texto_item} value={i.observacao} onChange={(e) => alterar({ observacao: e.target.value })} />
        </label>
        <div className="campo campo-arquivo">
          <span>Logo ou arte (opcional)</span>
          <input ref={entrada} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.pdf" onChange={(e) => void enviarArquivo(e.target.files?.[0])} />
          {i.arquivo ? (
            <span className="arquivo-escolhido">
              📎 {i.arquivo.nome}{' '}
              <button type="button" className="link-botao" onClick={() => alterar({ arquivo: null })}>
                tirar
              </button>
            </span>
          ) : (
            <button type="button" className="botao botao-contorno botao-pequeno" disabled={enviando} onClick={() => entrada.current?.click()}>
              {enviando ? 'Enviando…' : 'Enviar arquivo'}
            </button>
          )}
          {erroArquivo && <small className="alerta-minimo">{erroArquivo}</small>}
        </div>
      </div>
    </article>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void; language: string }) => string;
      reset: (id: string) => void;
    };
  }
}

/** Anti-robô Cloudflare Turnstile (carregado só nesta página e só quando configurado). */
function Captcha({ chave, aoResolver, reiniciar }: { chave: string; aoResolver: (t: string) => void; reiniciar: { current: () => void } }) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | null = null;
    const montar = () => {
      if (!caixa.current || !window.turnstile || id) return;
      id = window.turnstile.render(caixa.current, {
        sitekey: chave,
        callback: aoResolver,
        'expired-callback': () => aoResolver(''),
        language: 'pt-BR',
      });
      reiniciar.current = () => id && window.turnstile?.reset(id);
    };
    if (window.turnstile) montar();
    else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = montar;
      document.head.appendChild(s);
    }
  }, [chave, aoResolver, reiniciar]);
  return <div className="captcha" ref={caixa} />;
}
