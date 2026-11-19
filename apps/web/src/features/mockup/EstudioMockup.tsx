import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Image as KImage, Layer, Line, Rect, Stage, Text as KText, Transformer } from 'react-konva';
import type Konva from 'konva';
import {
  motivoBloqueioMockup,
  type CenaMockup,
  type ItemOrcamento,
  type ObjetoMockup,
  type Orcamento,
  type ResumoOrcamento,
  type TextoMockup,
} from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { ImagemProduto } from '../../components/ImagemProduto';
import { api } from '../../lib/api';
import { avisar, confirmar, erro, erroDe } from '../../lib/dialogo';
import { TagStatusOrcamento } from '../orcamentos/situacao';
import {
  carregarImagem,
  cenaVazia,
  chaveBitmap,
  DEMO_LOGO_SVG,
  duplicar,
  FONTES,
  LARGURA_EXPORTACAO,
  lerArquivoLogo,
  MESCLAS,
  novaLogo,
  novoTexto,
  prepararFonte,
  QUADRO,
  renderizarObjeto,
  TINTAS,
} from './cena';

type Patch = Partial<ObjetoMockup>;

/** Folha do orçamento para a tela de detalhes (mesmos campos da lista de orçamentos). */
function folhaDe(o: Orcamento) {
  return {
    id: o.id,
    numero: o.numero,
    dataHora: o.data_hora,
    itens: o.itens,
    subtotal: o.subtotal,
    frete: o.frete,
    total: o.total,
    pedido: o.pedido ?? null,
    status: o.status,
    observacao: o.observacao ?? null,
    responsavel: o.responsavel ?? null,
    alteradoPor: o.alterado_por ?? null,
    cliente: o.cliente ?? null,
    entregaPrevista: o.entrega_prevista ?? null,
  };
}

/** Produto do catálogo pelo fornecedor + código (para a galeria de fotos). */
async function fotosDoProduto(item: ItemOrcamento): Promise<string[]> {
  const base = item.imagem_url ? [item.imagem_url] : [];
  if (!item.codigo) return base;
  try {
    const r = await api.produtos({ q: item.codigo, fornecedor: item.fornecedor, estoque: false, limit: 20, offset: 0 });
    const p = r.produtos.find((x) => x.codigo === item.codigo);
    if (!p) return base;
    const d = await api.produto(p.id);
    return [...new Set([...base, ...d.fotos])];
  } catch {
    return base;
  }
}

/**
 * Aba "🎨 Mockups": cria os mockups dos produtos de um orçamento salvo
 * (opcional; só enquanto o orçamento está "Aberto"). Editor em Konva com
 * várias logos e textos, alças de transformação, curvatura e perspectiva.
 */
export function EstudioMockup() {
  const { tela, visitas, irPara, mockupSolicitado, mostrarOrcamento, setAbaOrcamentos, avisarOrcamentosAlterados } = useApp();

  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [abertos, setAbertos] = useState<ResumoOrcamento[] | null>(null);
  const [item, setItem] = useState<number | null>(null);
  const [cena, setCena] = useState<CenaMockup>(cenaVazia(null));
  const [sel, setSel] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [fotos, setFotos] = useState<string[]>([]);
  const [quebradas, setQuebradas] = useState<Set<string>>(new Set());
  const [fotoImg, setFotoImg] = useState<HTMLImageElement | null>(null);
  const [fotoFalhou, setFotoFalhou] = useState(false);
  const [guias, setGuias] = useState<{ v: boolean; h: boolean }>({ v: false, h: false });
  const [tam, setTam] = useState(600);
  const [, redesenhar] = useState(0);
  const [arrastando, setArrastando] = useState(false);

  const historico = useRef<{ passado: CenaMockup[]; futuro: CenaMockup[]; grupo: string; quando: number }>({
    passado: [],
    futuro: [],
    grupo: '',
    quando: 0,
  });
  const logos = useRef(new Map<string, HTMLImageElement>());
  const bitmaps = useRef(new Map<string, { chave: string; canvas: HTMLCanvasElement }>());
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const uiRef = useRef<Konva.Layer>(null);
  const palcoRef = useRef<HTMLDivElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const trocaLogoRef = useRef<HTMLInputElement>(null);
  const cenaRef = useRef(cena);
  cenaRef.current = cena;

  const editavel = !!orc && motivoBloqueioMockup(orc.numero, orc.status, orc.pedido?.codigo) === null;
  const bloqueio = orc ? motivoBloqueioMockup(orc.numero, orc.status, orc.pedido?.codigo) : null;
  const itemAtual = orc && item !== null ? (orc.itens[item] ?? null) : null;
  const salvo = orc && item !== null ? orc.mockups?.find((m) => m.item === item) : undefined;
  const objSel = cena.objetos.find((o) => o.id === sel) ?? null;

  // ── Orçamento ─────────────────────────────────────────────
  const listarAbertos = useCallback(async () => {
    try {
      const r = await api.orcamentos({ status: 'ABERTO' }, 50, 0);
      setAbertos(r.orcamentos);
    } catch {
      setAbertos([]);
    }
  }, []);

  const abrirOrcamento = useCallback(async (id: number) => {
    setCarregando(true);
    try {
      const o = await api.orcamento(id);
      setOrc(o);
      setItem(null);
      setCena(cenaVazia(null));
      setSel(null);
      setAlterado(false);
      setFotoImg(null);
      setFotos([]);
    } catch (e) {
      void erroDe('Não foi possível abrir o orçamento.', e);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Cada abertura da aba: orçamento pedido pelos detalhes ou a lista dos abertos
  useEffect(() => {
    if (visitas.mockup === 0) return;
    const pedido = mockupSolicitado.current;
    mockupSolicitado.current = null;
    if (pedido !== null && pedido !== orc?.id) void abrirOrcamento(pedido);
    else if (orc) void api.orcamento(orc.id).then(setOrc).catch(() => {});
    else void listarAbertos();
  }, [visitas.mockup]);

  // Primeiro item escolhido automaticamente
  useEffect(() => {
    if (orc && item === null && orc.itens.length) void escolherItem(0, true);
  }, [orc]);

  const descartarAlteracoes = async () =>
    !alterado ||
    (await confirmar('O mockup atual tem alterações não salvas. Descartar as alterações?', {
      titulo: 'Alterações não salvas',
      ok: 'Descartar',
      perigo: true,
    }));

  const escolherItem = async (n: number, inicial = false) => {
    if (!orc) return;
    if (!inicial && n === item) return;
    if (!inicial && !(await descartarAlteracoes())) return;
    const it = orc.itens[n];
    if (!it) return;
    setItem(n);
    setSel(null);
    setAlterado(false);
    historico.current = { passado: [], futuro: [], grupo: '', quando: 0 };
    let nova = cenaVazia(it.imagem_url || null);
    if (orc.mockups?.some((m) => m.item === n)) {
      try {
        const { cena: c } = await api.cenaMockup(orc.id, n);
        if (c && Array.isArray(c.objetos)) nova = c;
      } catch {
        /* sem cena: começa do zero */
      }
    }
    setCena(nova);
    void carregarFoto(nova.foto);
    setQuebradas(new Set());
    setFotos(it.imagem_url ? [it.imagem_url] : []);
    void fotosDoProduto(it).then((f) => setFotos(f));
  };

  const carregarFoto = async (url: string | null) => {
    setFotoFalhou(false);
    if (!url) return setFotoImg(null);
    try {
      setFotoImg(await carregarImagem(url));
    } catch {
      setFotoImg(null);
      setFotoFalhou(true);
    }
  };

  // ── Edição com histórico ──────────────────────────────────
  /** Aplica uma mudança; mudanças seguidas do mesmo controle viram um só "desfazer". */
  const mudar = (fn: (c: CenaMockup) => CenaMockup, grupo = '') => {
    const h = historico.current;
    const agora = Date.now();
    if (!grupo || grupo !== h.grupo || agora - h.quando > 800) {
      h.passado.push(cenaRef.current);
      if (h.passado.length > 60) h.passado.shift();
    }
    h.futuro = [];
    h.grupo = grupo;
    h.quando = agora;
    setCena(fn(cenaRef.current));
    setAlterado(true);
  };

  const atualizar = (id: string, patch: Patch, grupo = '') =>
    mudar(
      (c) => ({ ...c, objetos: c.objetos.map((o) => (o.id === id ? ({ ...o, ...patch } as ObjetoMockup) : o)) }),
      grupo ? `${id}:${grupo}` : '',
    );

  const desfazer = () => {
    const h = historico.current;
    const anterior = h.passado.pop();
    if (!anterior) return;
    h.futuro.push(cenaRef.current);
    h.grupo = '';
    setCena(anterior);
    setAlterado(true);
    if (sel && !anterior.objetos.some((o) => o.id === sel)) setSel(null);
  };
  const refazer = () => {
    const h = historico.current;
    const prox = h.futuro.pop();
    if (!prox) return;
    h.passado.push(cenaRef.current);
    h.grupo = '';
    setCena(prox);
    setAlterado(true);
  };

  const adicionar = (o: ObjetoMockup) => {
    mudar((c) => ({ ...c, objetos: [...c.objetos, o] }));
    setSel(o.id);
  };
  const excluirObjeto = (id: string) => {
    mudar((c) => ({ ...c, objetos: c.objetos.filter((o) => o.id !== id) }));
    setSel(null);
  };
  const moverCamada = (id: string, direcao: 1 | -1) =>
    mudar((c) => {
      const lista = [...c.objetos];
      const i = lista.findIndex((o) => o.id === id);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= lista.length) return c;
      [lista[i], lista[j]] = [lista[j]!, lista[i]!];
      return { ...c, objetos: lista };
    });

  const usarFoto = (url: string) => {
    mudar((c) => ({ ...c, foto: url }));
    void carregarFoto(url);
  };

  const adicionarLogo = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      void avisar('Selecione uma imagem (PNG transparente, SVG ou JPG).', { tipo: 'aviso', titulo: 'Arquivo inválido' });
      return;
    }
    try {
      adicionar(novaLogo(await lerArquivoLogo(file), file.name));
    } catch (e) {
      void erroDe('Não foi possível ler a imagem.', e);
    }
  };

  const trocarLogo = async (file: File) => {
    if (!objSel || objSel.tipo !== 'logo' || !file.type.startsWith('image/')) return;
    try {
      atualizar(objSel.id, { src: await lerArquivoLogo(file), nomeArquivo: file.name } as Patch);
    } catch (e) {
      void erroDe('Não foi possível ler a imagem.', e);
    }
  };

  // ── Imagens das logos e fontes dos textos ─────────────────
  useEffect(() => {
    for (const o of cena.objetos) {
      if (o.tipo === 'logo' && !logos.current.has(o.src)) {
        const img = new Image();
        img.onload = () => {
          logos.current.set(o.src, img);
          redesenhar((v) => v + 1);
        };
        img.src = o.src;
      }
      if (o.tipo === 'texto') {
        void prepararFonte(o).then(() => {
          bitmaps.current.delete(o.id);
          redesenhar((v) => v + 1);
        });
      }
    }
  }, [cena.objetos.map((o) => (o.tipo === 'texto' ? `${o.fonte}${o.negrito}${o.italico}` : o.src.length)).join('|')]);

  const bitmap = (o: ObjetoMockup): HTMLCanvasElement | null => {
    const chave = chaveBitmap(o);
    const atual = bitmaps.current.get(o.id);
    if (atual && atual.chave === chave) return atual.canvas;
    const canvas = renderizarObjeto(o, o.tipo === 'logo' ? (logos.current.get(o.src) ?? null) : null);
    if (canvas) bitmaps.current.set(o.id, { chave, canvas });
    return canvas;
  };

  // ── Palco: tamanho, seleção e teclado ─────────────────────
  useEffect(() => {
    const el = palcoRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setTam(Math.max(260, Math.min(720, Math.floor(el.clientWidth)))));
    obs.observe(el);
    return () => obs.disconnect();
  }, [orc]);

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    const node = sel && editavel ? stage.findOne(`#obj-${sel}`) : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  });

  useEffect(() => {
    if (tela !== 'mockup') return;
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable) return;
      if (document.querySelector('.dialogo-fundo, .custom-modal-backdrop.open')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        refazer();
        return;
      }
      if (!objSel || !editavel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        excluirObjeto(objSel.id);
        return;
      }
      const passo = (e.shiftKey ? 10 : 1) / QUADRO;
      const mov: Record<string, [number, number]> = {
        ArrowLeft: [-passo, 0],
        ArrowRight: [passo, 0],
        ArrowUp: [0, -passo],
        ArrowDown: [0, passo],
      };
      const m = mov[e.key];
      if (m) {
        e.preventDefault();
        atualizar(objSel.id, { x: objSel.x + m[0], y: objSel.y + m[1] }, 'teclado');
      }
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  // ── Exportar / salvar ─────────────────────────────────────
  const exportar = (tipo: 'image/jpeg' | 'image/png'): string | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const tr = trRef.current;
    const nos = tr?.nodes() ?? [];
    tr?.nodes([]);
    uiRef.current?.hide();
    try {
      return stage.toDataURL({ mimeType: tipo, quality: 0.92, pixelRatio: LARGURA_EXPORTACAO / tam });
    } catch {
      void erro(
        'A foto deste produto não pôde ser usada na imagem final (bloqueio do site do fornecedor). Escolha outra foto do produto.',
        { titulo: 'Não foi possível gerar a imagem' },
      );
      return null;
    } finally {
      uiRef.current?.show();
      tr?.nodes(nos);
    }
  };

  const salvar = async () => {
    if (!orc || item === null || !editavel) return;
    if (!cena.objetos.length) {
      void avisar('Adicione uma logo ou um texto antes de salvar o mockup.', { tipo: 'aviso', titulo: 'Mockup vazio' });
      return;
    }
    const imagem = exportar('image/jpeg');
    if (!imagem) return;
    setSalvando(true);
    try {
      const m = await api.salvarMockup(orc.id, item, imagem, cena);
      setOrc({ ...orc, mockups: [...(orc.mockups ?? []).filter((x) => x.item !== item), m].sort((a, b) => a.item - b.item) });
      setAlterado(false);
      avisarOrcamentosAlterados();
      void avisar(`O mockup de "${itemAtual?.nome ?? ''}" foi salvo no ${orc.numero}.`, { tipo: 'sucesso', titulo: 'Mockup salvo' });
    } catch (e) {
      void erroDe('Não foi possível salvar o mockup.', e);
    } finally {
      setSalvando(false);
    }
  };

  const excluirMockup = async () => {
    if (!orc || item === null || !salvo) return;
    const ok = await confirmar(`Excluir o mockup de "${itemAtual?.nome ?? ''}" do ${orc.numero}?`, {
      titulo: 'Excluir mockup',
      ok: 'Excluir',
      perigo: true,
    });
    if (!ok) return;
    try {
      await api.excluirMockup(orc.id, item);
      setOrc({ ...orc, mockups: (orc.mockups ?? []).filter((x) => x.item !== item) });
      setCena(cenaVazia(itemAtual?.imagem_url || null));
      void carregarFoto(itemAtual?.imagem_url || null);
      setAlterado(false);
      setSel(null);
      avisarOrcamentosAlterados();
    } catch (e) {
      void erroDe('Não foi possível excluir o mockup.', e);
    }
  };

  const baixar = () => {
    const url = exportar('image/png');
    if (!url) return;
    const a = document.createElement('a');
    a.download = `mockup-${orc?.numero ?? ''}-${itemAtual?.codigo || item}.png`;
    a.href = url;
    a.click();
  };

  const voltarAoOrcamento = async () => {
    if (!orc || !(await descartarAlteracoes())) return;
    try {
      const o = await api.orcamento(orc.id);
      mostrarOrcamento(folhaDe(o));
      setAbaOrcamentos('detalhe');
      setAlterado(false);
      irPara('orcamentos');
    } catch (e) {
      void erroDe('Não foi possível abrir o orçamento.', e);
    }
  };

  const trocarOrcamento = async () => {
    if (!(await descartarAlteracoes())) return;
    setOrc(null);
    setItem(null);
    setAlterado(false);
    setCena(cenaVazia(null));
    void listarAbertos();
  };

  // ── Desenho do fundo (foto do produto) ────────────────────
  const fundo = useMemo(() => {
    if (!fotoImg) return null;
    const k = Math.min((QUADRO * 0.9) / fotoImg.naturalWidth, (QUADRO * 0.9) / fotoImg.naturalHeight);
    const w = fotoImg.naturalWidth * k;
    const h = fotoImg.naturalHeight * k;
    return { x: (QUADRO - w) / 2, y: (QUADRO - h) / 2, w, h };
  }, [fotoImg]);

  const esc = tam / QUADRO;
  const fotosValidas = fotos.filter((f) => !quebradas.has(f));
  const comMockup = new Set((orc?.mockups ?? []).map((m) => m.item));

  // ── Tela ──────────────────────────────────────────────────
  return (
    <div id="view-mockup" style={{ display: tela === 'mockup' ? 'block' : 'none' }}>
      <div className="mockup-wrap">
        <div className="mockup-header-bar">
          <div>
            <h2 className="mockup-page-title">Estúdio de Mockups</h2>
            <p className="mockup-page-sub">
              Mockups opcionais dos produtos de um orçamento salvo. Podem ser criados e alterados enquanto o orçamento está{' '}
              <b>Aberto</b> (antes de ser enviado ao cliente) e aparecem na folha do orçamento, abaixo dos valores.
            </p>
          </div>
          {orc && (
            <div className="mk-cabecalho-acoes">
              <button className="btn-back" onClick={() => void trocarOrcamento()}>
                Trocar orçamento
              </button>
              <button className="btn-back" id="btn-mk-voltar" onClick={() => void voltarAoOrcamento()}>
                ← Voltar ao {orc.numero}
              </button>
            </div>
          )}
        </div>

        {!orc ? (
          <EscolherOrcamento abertos={abertos} carregando={carregando} abrir={(id) => void abrirOrcamento(id)} irPara={irPara} />
        ) : (
          <div className="mk-grade">
            {/* COLUNA 1: orçamento, itens e camadas */}
            <aside className="mk-coluna">
              <div className="mockup-panel">
                <div className="mockup-panel-header">
                  <span>
                    {orc.numero}
                    {orc.cliente?.nome ? ` · ${orc.cliente.nome}` : ''}
                  </span>
                  <TagStatusOrcamento status={orc.status} />
                </div>
                <div className="mockup-panel-body mk-itens" id="mk-itens">
                  {orc.itens.map((it, n) => (
                    <button
                      key={n}
                      type="button"
                      className={`mk-item${n === item ? ' ativo' : ''}`}
                      onClick={() => void escolherItem(n)}
                    >
                      <span className="mk-item-num">{n + 1}</span>
                      <ImagemProduto url={it.imagem_url} className="mk-item-foto" alt="" classeVazia="mk-item-foto vazia" vaziaDiv />
                      <span className="mk-item-info">
                        <span className="mk-item-nome" title={it.nome}>
                          {it.nome}
                        </span>
                        <span className="mk-item-cod">
                          {it.codigo || '—'} · {it.qty} un.
                        </span>
                      </span>
                      {comMockup.has(n) && (
                        <span className="mk-item-ok" title="Mockup salvo">
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {editavel && (
                <div className="mockup-panel">
                  <div className="mockup-panel-header">
                    <span>Adicionar</span>
                  </div>
                  <div className="mockup-panel-body">
                    <div
                      className={`mockup-dropzone${arrastando ? ' dragover' : ''}`}
                      id="mockup-dropzone"
                      onClick={() => arquivoRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setArrastando(true);
                      }}
                      onDragLeave={() => setArrastando(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setArrastando(false);
                        const f = e.dataTransfer.files[0];
                        if (f) void adicionarLogo(f);
                      }}
                    >
                      <input
                        ref={arquivoRef}
                        type="file"
                        id="mockup-file-input"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        style={{ display: 'none' }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          const f = e.target.files?.[0];
                          if (f) void adicionarLogo(f);
                          e.target.value = '';
                        }}
                      />
                      <div className="mockup-dropzone-icon">📁</div>
                      <div className="mockup-dropzone-title">Logo: clique ou arraste aqui</div>
                      <div className="mockup-dropzone-sub">PNG transparente, SVG ou JPG</div>
                    </div>
                    <div className="mk-botoes-linha">
                      <button className="mockup-tool-btn" id="btn-mk-texto" onClick={() => adicionar(novoTexto())}>
                        T Adicionar texto
                      </button>
                      <button className="mockup-tool-btn" id="btn-mk-demo" onClick={() => adicionar(novaLogo(DEMO_LOGO_SVG, 'logo-raizes.svg'))}>
                        ✦ Logo Raízes
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {cena.objetos.length > 0 && (
                <div className="mockup-panel">
                  <div className="mockup-panel-header">
                    <span>Camadas</span>
                    <span className="mockup-hint">a de cima fica na frente</span>
                  </div>
                  <div className="mockup-panel-body mk-camadas" id="mk-camadas">
                    {[...cena.objetos].reverse().map((o) => (
                      <button key={o.id} type="button" className={`mk-camada${o.id === sel ? ' ativa' : ''}`} onClick={() => setSel(o.id)}>
                        <span className="mk-camada-tipo">{o.tipo === 'logo' ? '🖼' : 'T'}</span>
                        <span className="mk-camada-nome">{o.tipo === 'logo' ? o.nomeArquivo : o.texto.split('\n')[0] || 'Texto'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* COLUNA 2: palco */}
            <section className="mk-centro">
              {bloqueio && (
                <div className="mk-aviso" id="mk-bloqueio">
                  {bloqueio} Os mockups salvos podem ser vistos e baixados, mas não alterados.
                </div>
              )}
              <div className="mk-barra">
                <button className="mockup-tool-btn" onClick={desfazer} disabled={!historico.current.passado.length} title="Desfazer (Ctrl+Z)">
                  ↶ Desfazer
                </button>
                <button className="mockup-tool-btn" onClick={refazer} disabled={!historico.current.futuro.length} title="Refazer (Ctrl+Y)">
                  ↷ Refazer
                </button>
                <div style={{ flex: 1 }} />
                <button className="btn-download-mockup" onClick={baixar} disabled={item === null} title="Baixar a imagem em alta resolução">
                  📥 Baixar PNG
                </button>
                {salvo && editavel && (
                  <button className="mockup-tool-btn perigo" id="btn-mk-excluir" onClick={() => void excluirMockup()}>
                    🗑 Excluir mockup
                  </button>
                )}
                {editavel && (
                  <button
                    className="btn-save-mockup"
                    id="btn-mk-salvar"
                    onClick={() => void salvar()}
                    disabled={salvando || item === null}
                    title="Salva a imagem no item do orçamento"
                  >
                    {salvando ? 'Salvando…' : `📄 Salvar no ${orc.numero}${alterado ? ' •' : ''}`}
                  </button>
                )}
              </div>

              {fotosValidas.length > 1 && editavel && (
                <div className="mockup-fotos-produto" id="mockup-fotos-produto">
                  <span>Foto do produto:</span>
                  {fotosValidas.map((f, i) => (
                    <button
                      key={f}
                      type="button"
                      className={`detalhe-produto-mini${cena.foto === f ? ' ativa' : ''}`}
                      title={`Usar a foto ${i + 1}`}
                      onClick={() => usarFoto(f)}
                    >
                      <img src={f} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setQuebradas((q) => new Set(q).add(f))} />
                    </button>
                  ))}
                </div>
              )}

              <div className="mk-palco" ref={palcoRef}>
                <Stage
                  ref={stageRef}
                  width={tam}
                  height={tam}
                  scaleX={esc}
                  scaleY={esc}
                  onMouseDown={(e) => {
                    if (e.target === e.target.getStage() || e.target.name() === 'fundo') setSel(null);
                  }}
                  onTouchStart={(e) => {
                    if (e.target === e.target.getStage() || e.target.name() === 'fundo') setSel(null);
                  }}
                  onWheel={(e) => {
                    if (!objSel || !editavel) return;
                    e.evt.preventDefault();
                    const fator = e.evt.deltaY < 0 ? 1.04 : 1 / 1.04;
                    atualizar(objSel.id, { largura: Math.max(0.03, Math.min(1.5, objSel.largura * fator)) }, 'roda');
                  }}
                >
                  <Layer>
                    <Rect name="fundo" x={0} y={0} width={QUADRO} height={QUADRO} fill="#FFFFFF" />
                    {fotoImg && fundo ? (
                      <KImage
                        name="fundo"
                        image={fotoImg}
                        x={fundo.x}
                        y={fundo.y}
                        width={fundo.w}
                        height={fundo.h}
                        shadowColor="rgba(58,24,63,0.18)"
                        shadowBlur={30}
                        shadowOffsetY={16}
                      />
                    ) : (
                      <>
                        <Rect name="fundo" x={350} y={250} width={300} height={480} cornerRadius={28} fill="#EDE9E1" />
                        <KText
                          name="fundo"
                          x={0}
                          y={770}
                          width={QUADRO}
                          align="center"
                          fontSize={22}
                          fill="#7A7167"
                          text={item === null ? 'Escolha um produto do orçamento' : fotoFalhou ? 'Foto indisponível — escolha outra' : 'Produto sem foto'}
                        />
                      </>
                    )}
                    {cena.objetos.map((o) => {
                      const bmp = bitmap(o);
                      if (!bmp) return null;
                      const w = o.largura * QUADRO;
                      const h = (w * bmp.height) / bmp.width;
                      return (
                        <KImage
                          key={o.id}
                          id={`obj-${o.id}`}
                          image={bmp}
                          x={o.x * QUADRO}
                          y={o.y * QUADRO}
                          width={w}
                          height={h}
                          offsetX={w / 2}
                          offsetY={h / 2}
                          rotation={o.rotacao}
                          opacity={o.opacidade}
                          globalCompositeOperation={o.mescla}
                          draggable={editavel}
                          onMouseDown={() => setSel(o.id)}
                          onTouchStart={() => setSel(o.id)}
                          onDragMove={(e) => {
                            const n = e.target;
                            const v = Math.abs(n.x() - QUADRO / 2) < 10;
                            const hh = Math.abs(n.y() - QUADRO / 2) < 10;
                            if (v) n.x(QUADRO / 2);
                            if (hh) n.y(QUADRO / 2);
                            if (v !== guias.v || hh !== guias.h) setGuias({ v, h: hh });
                          }}
                          onDragEnd={(e) => {
                            setGuias({ v: false, h: false });
                            atualizar(o.id, { x: e.target.x() / QUADRO, y: e.target.y() / QUADRO });
                          }}
                          onTransformEnd={(e) => {
                            const n = e.target;
                            const largura = Math.max(0.02, (w * Math.abs(n.scaleX())) / QUADRO);
                            n.scaleX(1);
                            n.scaleY(1);
                            atualizar(o.id, { largura, rotacao: Math.round(n.rotation()), x: n.x() / QUADRO, y: n.y() / QUADRO });
                          }}
                        />
                      );
                    })}
                  </Layer>
                  <Layer ref={uiRef}>
                    {guias.v && <Line points={[QUADRO / 2, 0, QUADRO / 2, QUADRO]} stroke="#5E3A73" strokeWidth={1.5} dash={[8, 6]} listening={false} />}
                    {guias.h && <Line points={[0, QUADRO / 2, QUADRO, QUADRO / 2]} stroke="#5E3A73" strokeWidth={1.5} dash={[8, 6]} listening={false} />}
                    <Transformer
                      ref={trRef}
                      rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                      rotationSnapTolerance={4}
                      keepRatio
                      enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                      anchorSize={11}
                      anchorCornerRadius={6}
                      anchorStroke="#5E3A73"
                      borderStroke="#5E3A73"
                      borderDash={[5, 4]}
                      rotateAnchorOffset={28}
                      boundBoxFunc={(antes, depois) => (depois.width < 12 || depois.height < 12 ? antes : depois)}
                    />
                  </Layer>
                </Stage>
              </div>
              <p className="mk-dica">
                Clique numa logo ou texto para selecionar · arraste para mover · alças para girar e redimensionar · roda do mouse
                redimensiona · setas movem · Delete exclui · as guias aparecem no centro.
              </p>
            </section>

            {/* COLUNA 3: propriedades */}
            <aside className="mk-coluna" id="mk-propriedades">
              <div className="mockup-panel">
                <div className="mockup-panel-header">
                  <span>{objSel ? (objSel.tipo === 'logo' ? 'Logo selecionada' : 'Texto selecionado') : 'Propriedades'}</span>
                </div>
                <div className="mockup-panel-body">
                  {!objSel ? (
                    <p className="mk-vazio">
                      {cena.objetos.length
                        ? 'Selecione uma logo ou um texto no produto (ou na lista de camadas) para ajustar.'
                        : editavel
                          ? 'Adicione uma logo ou um texto para começar.'
                          : 'Sem elementos neste mockup.'}
                    </p>
                  ) : (
                    <Propriedades
                      o={objSel}
                      editavel={editavel}
                      atualizar={(patch, grupo) => atualizar(objSel.id, patch, grupo)}
                      trocarLogo={() => trocaLogoRef.current?.click()}
                      duplicar={() => adicionar(duplicar(objSel))}
                      excluir={() => excluirObjeto(objSel.id)}
                      frente={() => moverCamada(objSel.id, 1)}
                      tras={() => moverCamada(objSel.id, -1)}
                    />
                  )}
                  <input
                    ref={trocaLogoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void trocarLogo(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

/** Lista dos orçamentos abertos (quando o estúdio é aberto pelo menu). */
function EscolherOrcamento({
  abertos,
  carregando,
  abrir,
  irPara,
}: {
  abertos: ResumoOrcamento[] | null;
  carregando: boolean;
  abrir: (id: number) => void;
  irPara: (t: 'carrinho' | 'orcamentos') => void;
}) {
  return (
    <div className="mockup-panel mk-escolher" id="mk-escolher">
      <div className="mockup-panel-header">
        <span>Escolha o orçamento</span>
        <span className="mockup-hint">só orçamentos Abertos (ainda não enviados)</span>
      </div>
      <div className="mockup-panel-body">
        {abertos === null || carregando ? (
          <p className="mk-vazio">Carregando…</p>
        ) : abertos.length === 0 ? (
          <div className="mk-vazio">
            <p>Nenhum orçamento aberto. Primeiro crie o orçamento no Carrinho; depois, nos detalhes dele, use 🎨 Mockups.</p>
            <button className="btn-back" onClick={() => irPara('carrinho')} style={{ marginTop: 10 }}>
              Ir ao carrinho
            </button>
          </div>
        ) : (
          <div className="mk-lista-orc">
            {abertos.map((o) => (
              <button key={o.id} type="button" className="mk-orc" onClick={() => abrir(o.id)}>
                <span className="mk-orc-num">{o.numero}</span>
                <span className="mk-orc-cli">{o.cliente?.nome || 'Sem cliente'}</span>
                <span className="mk-orc-info">
                  {o.qtd_itens} {o.qtd_itens === 1 ? 'produto' : 'produtos'} · {new Date(o.data_hora).toLocaleDateString('pt-BR')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Deslizante({
  rotulo,
  valor,
  min,
  max,
  sufixo = '',
  desabilitado,
  mudar,
  id,
}: {
  rotulo: string;
  valor: number;
  min: number;
  max: number;
  sufixo?: string;
  desabilitado: boolean;
  mudar: (v: number) => void;
  id?: string;
}) {
  return (
    <div className="mk-campo">
      <div className="mk-campo-topo">
        <label className="mockup-label" htmlFor={id}>
          {rotulo}
        </label>
        <span className="mockup-val">
          {valor}
          {sufixo}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="mockup-range"
        min={min}
        max={max}
        value={valor}
        disabled={desabilitado}
        onChange={(e) => mudar(Number(e.target.value))}
      />
    </div>
  );
}

function Propriedades({
  o,
  editavel,
  atualizar,
  trocarLogo,
  duplicar,
  excluir,
  frente,
  tras,
}: {
  o: ObjetoMockup;
  editavel: boolean;
  atualizar: (patch: Patch, grupo?: string) => void;
  trocarLogo: () => void;
  duplicar: () => void;
  excluir: () => void;
  frente: () => void;
  tras: () => void;
}) {
  const d = !editavel;
  const texto = o.tipo === 'texto' ? (o as TextoMockup) : null;
  return (
    <div className="mk-props">
      {texto && (
        <>
          <div className="mk-campo">
            <label className="mockup-label" htmlFor="mk-texto">
              Texto
            </label>
            <textarea
              id="mk-texto"
              className="mockup-select mk-textarea"
              rows={2}
              value={texto.texto}
              disabled={d}
              onChange={(e) => atualizar({ texto: e.target.value } as Patch, 'texto')}
            />
          </div>
          <div className="mk-linha">
            <select
              className="mockup-select"
              value={texto.fonte}
              disabled={d}
              id="mk-fonte"
              onChange={(e) => atualizar({ fonte: e.target.value } as Patch)}
              style={{ fontFamily: texto.fonte }}
            >
              {FONTES.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </select>
            <input
              type="color"
              className="mk-cor"
              value={texto.cor}
              disabled={d}
              title="Cor do texto"
              onChange={(e) => atualizar({ cor: e.target.value } as Patch, 'cor')}
            />
            <button
              type="button"
              className={`mockup-tool-btn mk-toggle${texto.negrito ? ' ativo' : ''}`}
              disabled={d}
              title="Negrito"
              onClick={() => atualizar({ negrito: !texto.negrito } as Patch)}
            >
              <b>N</b>
            </button>
            <button
              type="button"
              className={`mockup-tool-btn mk-toggle${texto.italico ? ' ativo' : ''}`}
              disabled={d}
              title="Itálico"
              onClick={() => atualizar({ italico: !texto.italico } as Patch)}
            >
              <i>I</i>
            </button>
          </div>
        </>
      )}
      {o.tipo === 'logo' && (
        <div className="mk-logo-atual">
          <img src={o.src} alt="" />
          <span title={o.nomeArquivo}>{o.nomeArquivo}</span>
          {editavel && (
            <button type="button" className="link-botao" onClick={trocarLogo}>
              Trocar
            </button>
          )}
        </div>
      )}

      <div className="mk-campo">
        <label className="mockup-label">Mesclagem</label>
        <select className="mockup-select" value={o.mescla} disabled={d} id="mk-mescla" onChange={(e) => atualizar({ mescla: e.target.value as ObjetoMockup['mescla'] })}>
          {MESCLAS.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.rotulo}
            </option>
          ))}
        </select>
      </div>
      <div className="mk-campo">
        <label className="mockup-label">Acabamento</label>
        <div className="mockup-tint-options">
          {TINTAS.map((t) => (
            <button
              key={t.valor}
              type="button"
              className={`mockup-tint-btn${o.tinta === t.valor ? ' active' : ''}`}
              data-tint={t.valor}
              disabled={d}
              onClick={() => atualizar({ tinta: t.valor })}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
      </div>

      <Deslizante id="mk-tamanho" rotulo="Tamanho" valor={Math.round(o.largura * 100)} min={3} max={120} sufixo="%" desabilitado={d} mudar={(v) => atualizar({ largura: v / 100 }, 'largura')} />
      <Deslizante id="mk-rotacao" rotulo="Rotação" valor={Math.round(o.rotacao)} min={-180} max={180} sufixo="°" desabilitado={d} mudar={(v) => atualizar({ rotacao: v }, 'rotacao')} />
      <Deslizante id="mk-opacidade" rotulo="Opacidade" valor={Math.round(o.opacidade * 100)} min={10} max={100} sufixo="%" desabilitado={d} mudar={(v) => atualizar({ opacidade: v / 100 }, 'opacidade')} />
      <Deslizante id="mk-curva" rotulo="Curvatura (canecas, garrafas)" valor={o.curva} min={-100} max={100} desabilitado={d} mudar={(v) => atualizar({ curva: v }, 'curva')} />
      <Deslizante id="mk-perspectiva" rotulo="Perspectiva" valor={o.perspectiva} min={-100} max={100} desabilitado={d} mudar={(v) => atualizar({ perspectiva: v }, 'perspectiva')} />

      {editavel && (
        <div className="mk-acoes-grade">
          <button className="mockup-tool-btn" onClick={() => atualizar({ x: 0.5 })} title="Centralizar na horizontal">
            ↔ Centro X
          </button>
          <button className="mockup-tool-btn" onClick={() => atualizar({ y: 0.5 })} title="Centralizar na vertical">
            ↕ Centro Y
          </button>
          <button className="mockup-tool-btn" onClick={() => atualizar({ rotacao: ((o.rotacao + 90 + 180) % 360) - 180 })}>
            ↻ +90°
          </button>
          <button className="mockup-tool-btn" onClick={() => atualizar({ curva: 0, perspectiva: 0, rotacao: 0 })} title="Zera rotação, curvatura e perspectiva">
            ↺ Endireitar
          </button>
          <button className="mockup-tool-btn" onClick={frente} title="Trazer para a frente">
            ⬆ Frente
          </button>
          <button className="mockup-tool-btn" onClick={tras} title="Enviar para trás">
            ⬇ Trás
          </button>
          <button className="mockup-tool-btn" onClick={duplicar}>
            ⧉ Duplicar
          </button>
          <button className="mockup-tool-btn perigo" id="btn-mk-remover-objeto" onClick={excluir}>
            🗑 Remover
          </button>
        </div>
      )}
    </div>
  );
}
