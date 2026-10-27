import { useEffect, useReducer, useRef, useState } from 'react';
import { useApp } from '../../app/contexto';
import { ImagemProduto } from '../../components/ImagemProduto';
import { classeFornecedor } from '../../lib/fornecedor';
import { useCarrinho } from '../../state/carrinho';
import {
  carregarImagemProduto,
  DEMO_LOGO_SVG,
  DEMO_PRODUCT,
  desenhar,
  estadoInicial,
  ID_DEMO,
  ligarInteracao,
  type Mesclagem,
  type Tinta,
} from './motor';

const TINTAS: { valor: Tinta; rotulo: string }[] = [
  { valor: 'original', rotulo: 'Original' },
  { valor: 'white', rotulo: 'Branco' },
  { valor: 'black', rotulo: 'Preto' },
  { valor: 'gold', rotulo: 'Dourado' },
];

/** Aba "🎨 Mockups": aplica a logomarca sobre a foto dos produtos do carrinho. */
export function EstudioMockup() {
  const { tela, visitas, irPara, mockupSolicitado } = useApp();
  const { estado, vincularMockup } = useCarrinho();
  const [st] = useState(estadoInicial);
  const [, atualizarTela] = useReducer((x: number) => x + 1, 0);
  const [arrastandoArquivo, setArrastandoArquivo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  // Sempre a versão mais recente do carrinho dentro dos callbacks
  const itensRef = useRef(estado.itens);
  itensRef.current = estado.itens;

  const render = () => desenhar(canvasRef.current, st);

  const definirEscala = (val: number | string) => {
    st.scale = Number.parseInt(String(val), 10) || 35;
    atualizarTela();
    render();
  };
  const definirRotacao = (val: number | string) => {
    st.rotation = Number.parseInt(String(val), 10) || 0;
    atualizarTela();
    render();
  };

  // Arrastar / roda do mouse no canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return ligarInteracao(canvas, st, () => desenhar(canvas, st), definirEscala);
  }, []);

  const selecionarProduto = (id: number | string) => {
    st.selectedProductId = id;
    atualizarTela();
    const prod = id === ID_DEMO ? DEMO_PRODUCT : itensRef.current[id]?.produto;
    if (!prod) return;
    if (prod.imagem_url) {
      carregarImagemProduto(st, prod.imagem_url, render);
    } else {
      st.productImg = null;
      st.productImgSrc = null;
      render();
    }
  };

  const usarLogoDemo = () => {
    const img = new Image();
    img.onload = () => {
      st.logoImg = img;
      st.logoDataUrl = DEMO_LOGO_SVG;
      st.logoFilename = 'logo-raizes.svg';
      st.logoDims = '320 × 120 px';
      atualizarTela();
      render();
    };
    img.src = DEMO_LOGO_SVG;
  };

  // Cada abertura da aba: escolhe o produto, garante uma logo e redesenha
  useEffect(() => {
    if (visitas.mockup === 0) return;
    const solicitado = mockupSolicitado.current;
    mockupSolicitado.current = null;
    if (solicitado !== null) st.selectedProductId = solicitado;

    const itens = itensRef.current;
    const ids = Object.keys(itens);
    const sel = st.selectedProductId;
    if (!sel || (sel !== ID_DEMO && !itens[sel])) {
      selecionarProduto(ids.length > 0 ? ids[0]! : ID_DEMO);
    }
    if (!st.logoImg) usarLogoDemo();
    const t = setTimeout(render, 40);
    if (solicitado !== null) selecionarProduto(solicitado);
    atualizarTela();
    return () => clearTimeout(t);
  }, [visitas.mockup]);

  const carregarArquivoLogo = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione um arquivo de imagem válido (PNG, SVG ou JPG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? '');
      const img = new Image();
      img.onload = () => {
        st.logoImg = img;
        st.logoDataUrl = dataUrl;
        st.logoFilename = file.name;
        st.logoDims = `${img.naturalWidth || img.width} × ${img.naturalHeight || img.height} px`;
        atualizarTela();
        render();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const removerLogo = () => {
    st.logoImg = null;
    st.logoDataUrl = null;
    atualizarTela();
    render();
  };

  const alterar = (mudanca: () => void) => {
    mudanca();
    atualizarTela();
    render();
  };

  const rotacionar = (graus: number) => {
    let nova = (st.rotation + graus) % 360;
    if (nova > 180) nova -= 360;
    if (nova < -180) nova += 360;
    definirRotacao(nova);
  };

  const resetar = () => {
    st.posX = 0.5;
    st.posY = 0.52;
    definirEscala(35);
    definirRotacao(0);
  };

  const baixarPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cod = itensRef.current[String(st.selectedProductId)]?.produto?.codigo || 'PRODUTO';
    const a = document.createElement('a');
    a.download = `mockup-${cod}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  const salvarNoOrcamento = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const id = st.selectedProductId;
    if (id !== null && itensRef.current[id]) {
      vincularMockup(id, canvas.toDataURL('image/jpeg', 0.92));
      alert('✓ Mockup salvo e vinculado com sucesso a este produto no orçamento!');
    } else {
      alert('Adicione este produto ao orçamento no Catálogo para poder vincular o mockup a ele.');
    }
  };

  const itens = Object.values(estado.itens);

  return (
    <div id="view-mockup" style={{ display: tela === 'mockup' ? 'block' : 'none' }}>
      <div className="mockup-wrap">
        <div className="mockup-header-bar">
          <div>
            <h2 className="mockup-page-title">Estúdio de Mockups</h2>
            <p className="mockup-page-sub">
              Aplique sua logomarca na foto real dos produtos do orçamento com posicionamento e escala interativos.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-back" onClick={() => irPara('carrinho')}>
              ← Ver Carrinho
            </button>
            <button className="btn-back" onClick={() => irPara('catalogo')}>
              Catálogo
            </button>
          </div>
        </div>

        <div className="mockup-grid">
          {/* COLUNA 1: PRODUTOS & LOGO */}
          <div className="mockup-col-sidebar">
            <div className="mockup-panel">
              <div className="mockup-panel-header">
                <span>📦 Produtos no Orçamento</span>
                <span className="mockup-badge" id="mockup-prod-count">
                  {visitas.mockup > 0 ? itens.length : 0}
                </span>
              </div>
              <div className="mockup-panel-body" style={{ padding: 12 }}>
                <div id="mockup-prod-list" className="mockup-prod-list">
                  {visitas.mockup === 0 ? null : itens.length === 0 ? (
                    <div style={{ padding: '10px 4px', textAlign: 'center' }}>
                      <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8 }}>
                        Nenhum item adicionado no carrinho ainda.
                      </p>
                      <div className="mockup-prod-item active" onClick={() => selecionarProduto(ID_DEMO)}>
                        <div className="mockup-prod-thumb-empty">☕</div>
                        <div className="mockup-prod-meta">
                          <div className="mockup-prod-title">Caneca Térmica Inox 400ml</div>
                          <div className="mockup-prod-sub">
                            <span className="sup-badge sup-LOCAL">EXEMPLO</span> Cód: DEMO-01
                          </div>
                        </div>
                      </div>
                      <button
                        className="btn-back"
                        onClick={() => irPara('catalogo')}
                        style={{ marginTop: 10, width: '100%', fontSize: '.76rem', padding: 6 }}
                      >
                        + Adicionar itens no Catálogo
                      </button>
                    </div>
                  ) : (
                    itens.map(({ produto: p }) => (
                      <div
                        key={p.id}
                        className={`mockup-prod-item ${String(st.selectedProductId) === String(p.id) ? 'active' : ''}`}
                        onClick={() => selecionarProduto(p.id)}
                      >
                        <ImagemProduto
                          url={p.imagem_url}
                          className="mockup-prod-thumb"
                          alt={p.nome ?? ''}
                          classeVazia="mockup-prod-thumb-empty"
                          vaziaDiv
                        />
                        <div className="mockup-prod-meta">
                          <div className="mockup-prod-title" title={p.nome ?? ''}>
                            {p.nome}
                          </div>
                          <div className="mockup-prod-sub">
                            <span className={`sup-badge ${classeFornecedor(p.fornecedor, p.origem)}`}>
                              {p.fornecedor}
                            </span>
                            <span>Cód: {p.codigo || '—'}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="mockup-panel" style={{ marginTop: 14 }}>
              <div className="mockup-panel-header">
                <span>🎨 Logomarca a Aplicar</span>
              </div>
              <div className="mockup-panel-body">
                <div
                  className={`mockup-dropzone${arrastandoArquivo ? ' dragover' : ''}`}
                  id="mockup-dropzone"
                  onClick={() => arquivoRef.current?.click()}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setArrastandoArquivo(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setArrastandoArquivo(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setArrastandoArquivo(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setArrastandoArquivo(false);
                    const files = e.dataTransfer.files;
                    if (files && files.length) carregarArquivoLogo(files[0]!);
                  }}
                >
                  <input
                    ref={arquivoRef}
                    type="file"
                    id="mockup-file-input"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    style={{ display: 'none' }}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const files = e.target.files;
                      if (files && files.length) carregarArquivoLogo(files[0]!);
                    }}
                  />
                  <div className="mockup-dropzone-icon">📁</div>
                  <div className="mockup-dropzone-title">Clique ou arraste a logo aqui</div>
                  <div className="mockup-dropzone-sub">PNG transparente, SVG ou JPG</div>
                </div>

                <div
                  id="mockup-logo-active-bar"
                  className="mockup-logo-active-bar"
                  style={{ display: st.logoImg ? 'flex' : 'none' }}
                >
                  <div className="mockup-logo-active-thumb">
                    <img id="mockup-logo-preview-img" src={st.logoDataUrl ?? undefined} alt="Logo" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '.82rem',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      id="mockup-logo-filename"
                    >
                      {st.logoFilename}
                    </div>
                    <div style={{ fontSize: '.72rem', color: 'var(--muted)' }} id="mockup-logo-dims">
                      {st.logoDims}
                    </div>
                  </div>
                  <button className="btn-remove-logo" onClick={removerLogo} title="Remover Logo">
                    ✕
                  </button>
                </div>

                <button className="btn-demo-logo" onClick={usarLogoDemo}>
                  ✦ Usar Logo Raízes (Demonstração)
                </button>

                <div className="mockup-control-group">
                  <label className="mockup-label">Modo de Aplicação (Mesclagem)</label>
                  <select
                    id="mockup-blend"
                    className="mockup-select"
                    value={st.blendMode}
                    onChange={(e) => alterar(() => (st.blendMode = e.target.value as Mesclagem))}
                  >
                    <option value="multiply">Multiplicar (Estampa realista no produto)</option>
                    <option value="source-over">Normal (Opaco / Adesivo)</option>
                    <option value="overlay">Sobrepor (Gravação sutil / Laser)</option>
                    <option value="screen">Tela (Silk claro em produto escuro)</option>
                  </select>
                </div>

                <div className="mockup-control-group">
                  <label className="mockup-label">Efeito / Acabamento da Logo</label>
                  <div className="mockup-tint-options">
                    {TINTAS.map((t) => (
                      <button
                        key={t.valor}
                        className={`mockup-tint-btn${st.tint === t.valor ? ' active' : ''}`}
                        data-tint={t.valor}
                        onClick={() => alterar(() => (st.tint = t.valor))}
                      >
                        {t.rotulo}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mockup-control-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <label className="mockup-label" style={{ margin: 0 }}>
                      Opacidade da Estampa
                    </label>
                    <span className="mockup-val" id="val-mockup-opacity">
                      {st.opacity}%
                    </span>
                  </div>
                  <input
                    type="range"
                    className="mockup-range"
                    id="mockup-opacity"
                    min="20"
                    max="100"
                    value={st.opacity}
                    onChange={(e) => alterar(() => (st.opacity = Number.parseInt(e.target.value, 10) || 95))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* COLUNA 2: POSICIONAMENTO INTERATIVO */}
          <div className="mockup-col-editor">
            <div className="mockup-panel">
              <div className="mockup-panel-header">
                <span>🎯 Visualização da Logo no Produto</span>
                <span className="mockup-hint">Arraste a logo diretamente sobre o produto</span>
              </div>
              <div className="mockup-panel-body">
                <div className="mockup-canvas-stage" id="mockup-canvas-stage">
                  <canvas id="mockup-canvas-2d" width={700} height={700} ref={canvasRef} />
                  <div className="mockup-canvas-overlay-tip" id="mockup-canvas-overlay-tip">
                    <span>🖱️ Arraste para mover · Roda do mouse redimensiona</span>
                  </div>
                </div>

                <div className="mockup-adjust-box">
                  <div className="mockup-slider-row">
                    <div className="mockup-slider-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <label className="mockup-label">Tamanho / Escala da Logo</label>
                        <span className="mockup-val" id="val-mockup-scale">
                          {st.scale}%
                        </span>
                      </div>
                      <input
                        type="range"
                        className="mockup-range"
                        id="mockup-scale"
                        min="10"
                        max="120"
                        value={st.scale}
                        onChange={(e) => definirEscala(e.target.value)}
                      />
                    </div>

                    <div className="mockup-slider-item">
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <label className="mockup-label">Rotação da Logo</label>
                        <span className="mockup-val" id="val-mockup-rotation">
                          {st.rotation}°
                        </span>
                      </div>
                      <input
                        type="range"
                        className="mockup-range"
                        id="mockup-rotation"
                        min="-180"
                        max="180"
                        value={st.rotation}
                        onChange={(e) => definirRotacao(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mockup-btn-toolbar">
                    <button className="mockup-tool-btn" onClick={() => alterar(() => (st.posX = 0.5))} title="Centralizar Horizontalmente">
                      ↔ Centrar X
                    </button>
                    <button className="mockup-tool-btn" onClick={() => alterar(() => (st.posY = 0.5))} title="Centralizar Verticalmente">
                      ↕ Centrar Y
                    </button>
                    <button className="mockup-tool-btn" onClick={() => rotacionar(90)} title="Girar 90 Graus">
                      ↻ +90°
                    </button>
                    <button className="mockup-tool-btn" onClick={resetar} title="Resetar Posição">
                      ↺ Reset
                    </button>
                    <div style={{ flex: 1 }} />
                    <button
                      className="btn-download-mockup"
                      onClick={baixarPng}
                      title="Baixar imagem do mockup em alta resolução"
                    >
                      📥 Baixar Imagem (PNG)
                    </button>
                    <button
                      className="btn-save-mockup"
                      onClick={salvarNoOrcamento}
                      title="Salvar mockup vinculado ao item do orçamento"
                    >
                      📄 Salvar no Orçamento
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
