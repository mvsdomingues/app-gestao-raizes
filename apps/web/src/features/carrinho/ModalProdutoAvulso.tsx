import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useApp } from '../../app/contexto';
import { useCarrinho } from '../../state/carrinho';

const LIMITE_FOTO = 5 * 1024 * 1024;

interface Foto {
  dataUrl: string;
  nome: string;
  tamanho: string;
}

/** Modal para incluir/editar um produto que não está na base dos fornecedores. */
export function ModalProdutoAvulso() {
  const { modalAvulso, fecharModalAvulso, tela, irPara } = useApp();
  const { estado, salvarAvulso } = useCarrinho();

  const [nome, setNome] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [preco, setPreco] = useState('');
  const [codigo, setCodigo] = useState('');
  const [foto, setFoto] = useState<Foto | null>(null);
  const [bordaZona, setBordaZona] = useState('');
  const nomeRef = useRef<HTMLInputElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const aberto = modalAvulso !== null;
  const editarId = typeof modalAvulso === 'number' && estado.itens[modalAvulso] ? modalAvulso : null;

  // Ao abrir: preenche os campos (edição) ou limpa (novo)
  useEffect(() => {
    if (!aberto) return;
    setFoto(null);
    const p = editarId !== null ? estado.itens[editarId]?.produto : undefined;
    if (p) {
      setNome(p.nome || '');
      setFornecedor(p.fornecedor || '');
      setPreco((p.preco || 0).toFixed(2));
      setCodigo(p.codigo || '');
      // Repopula a foto se já existia
      if (p.imagem_url && p.imagem_url.startsWith('data:')) {
        setFoto({ dataUrl: p.imagem_url, nome: 'foto-produto', tamanho: '' });
      }
    } else {
      setNome('');
      setFornecedor('');
      setPreco('');
      setCodigo('');
    }
    const t = setTimeout(() => nomeRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [modalAvulso]);

  const fechar = () => {
    fecharModalAvulso();
    setFoto(null);
  };

  const carregarFoto = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem (JPG, PNG ou WEBP).');
      return;
    }
    if (file.size > LIMITE_FOTO) {
      alert('A foto deve ter no máximo 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFoto({
        dataUrl: String(ev.target?.result ?? ''),
        nome: file.name,
        tamanho: (file.size / 1024).toFixed(0) + ' KB',
      });
    };
    reader.readAsDataURL(file);
  };

  const aoSoltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setBordaZona('');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) carregarFoto(file);
  };

  const salvar = () => {
    const n = nome.trim();
    const f = fornecedor.trim() || 'AVULSO';
    const valor = Number.parseFloat(preco);
    const c = codigo.trim();
    if (!n) {
      alert('Informe a descrição do produto.');
      return;
    }
    if (Number.isNaN(valor) || valor < 0) {
      alert('Informe um custo unitário válido (≥ 0).');
      return;
    }
    salvarAvulso(editarId, { nome: n, fornecedor: f, preco: valor, codigo: c, imagem_url: foto ? foto.dataUrl : null });
    fechar();
    // Garante que o carrinho esteja visível
    if (tela !== 'carrinho') irPara('carrinho');
  };

  return (
    <div
      id="custom-modal"
      className={aberto ? 'open' : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div className="custom-modal-card">
        <div className="custom-modal-header">
          <h3 className="custom-modal-title" id="custom-modal-title">
            {editarId !== null ? 'Editar produto avulso' : 'Adicionar produto avulso'}
          </h3>
          <button className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          Use para produtos que não estão na base de fornecedores integrada. O item entra no orçamento com a
          calculadora normal.
        </p>

        <div className="custom-modal-field">
          <label className="custom-modal-label">Descrição do produto *</label>
          <input
            ref={nomeRef}
            id="custom-nome"
            className="custom-input"
            type="text"
            placeholder="Ex: Caneca de cerâmica personalizada 300ml"
            maxLength={120}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>

        <div className="custom-modal-row">
          <div className="custom-modal-field" style={{ flex: 1 }}>
            <label className="custom-modal-label">Fornecedor *</label>
            <input
              id="custom-fornecedor"
              className="custom-input"
              type="text"
              placeholder="Ex: Local, Importado, etc."
              list="fornecedores-custom"
              maxLength={20}
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
            />
            <datalist id="fornecedores-custom">
              <option value="Local" />
              <option value="Importado" />
              <option value="Outro" />
            </datalist>
          </div>
          <div className="custom-modal-field" style={{ width: 140 }}>
            <label className="custom-modal-label">Custo unitário (R$) *</label>
            <input
              id="custom-preco"
              className="custom-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
            />
          </div>
        </div>

        <div className="custom-modal-field">
          <label className="custom-modal-label">Código (opcional)</label>
          <input
            id="custom-codigo"
            className="custom-input"
            type="text"
            placeholder="Ex: AVL-001"
            maxLength={40}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
        </div>

        <div className="custom-modal-field">
          <label className="custom-modal-label">Foto do produto (opcional — usada no Mockup)</label>
          <div
            className={`custom-foto-zone${foto ? ' has-foto' : ''}`}
            id="custom-foto-zone"
            style={bordaZona ? { borderColor: bordaZona } : undefined}
            onClick={() => arquivoRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setBordaZona('var(--uva)');
            }}
            onDragLeave={() => setBordaZona('')}
            onDrop={aoSoltar}
          >
            <input
              ref={arquivoRef}
              type="file"
              id="custom-foto-input"
              accept="image/*"
              style={{ display: 'none' }}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) carregarFoto(file);
                // Limpa o campo para permitir selecionar o mesmo arquivo de novo
                e.target.value = '';
              }}
            />

            {/* Estado: sem foto */}
            <div id="custom-foto-empty-state" style={{ display: foto ? 'none' : undefined }}>
              <div style={{ fontSize: '1.6rem', marginBottom: 4 }}>📷</div>
              <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--berinjela)' }}>
                Clique ou arraste a foto aqui
              </div>
              <div style={{ fontSize: '.71rem', color: 'var(--muted)', marginTop: 2 }}>JPG, PNG ou WEBP — máx. 5 MB</div>
            </div>

            {/* Estado: com foto */}
            <div
              id="custom-foto-preview-state"
              className="custom-foto-preview-wrap"
              style={{ display: foto ? 'flex' : 'none' }}
            >
              <img id="custom-foto-preview-img" className="custom-foto-preview" src={foto?.dataUrl || undefined} alt="Foto" />
              <div className="custom-foto-preview-info">
                <div className="custom-foto-preview-name" id="custom-foto-preview-name">
                  {foto?.nome ?? '—'}
                </div>
                <div className="custom-foto-preview-size" id="custom-foto-preview-size">
                  {foto ? foto.tamanho || 'Imagem carregada' : '—'}
                </div>
              </div>
              <button
                className="btn-remove-foto"
                title="Remover foto"
                onClick={(e) => {
                  e.stopPropagation();
                  setFoto(null);
                }}
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="custom-modal-actions">
          <button className="btn-secondary" onClick={fechar}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={salvar}>
            Adicionar ao carrinho
          </button>
        </div>
      </div>
    </div>
  );
}
