import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FORNECEDOR_PROPRIO, type DadosProdutoProprio, type ProdutoProprio } from '@raizes/shared';
import { api } from '../../lib/api';

const LIMITE_FOTO = 5 * 1024 * 1024;

interface Foto {
  dataUrl: string;
  nome: string;
  tamanho: string;
}

interface Props {
  /** null = fechado; 'novo' = inclusão; produto = edição */
  produto: ProdutoProprio | 'novo' | null;
  fechar: () => void;
  salvo: (p: ProdutoProprio, novo: boolean) => void;
}

/** Modal de inclusão/alteração de produto próprio (mesmo visual dos demais modais). */
export function FormularioProdutoProprio({ produto, fechar, salvo }: Props) {
  const aberto = produto !== null;
  const edicao = produto !== null && produto !== 'novo' ? produto : null;

  const [nome, setNome] = useState('');
  const [fornecedor, setFornecedor] = useState(FORNECEDOR_PROPRIO);
  const [preco, setPreco] = useState('');
  const [estoque, setEstoque] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');
  const [foto, setFoto] = useState<Foto | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [bordaZona, setBordaZona] = useState('');
  const nomeRef = useRef<HTMLInputElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  // Ao abrir: preenche com o produto (alteração) ou limpa (inclusão)
  useEffect(() => {
    if (!aberto) return;
    setNome(edicao?.nome ?? '');
    setFornecedor(edicao?.fornecedor ?? FORNECEDOR_PROPRIO);
    setPreco(edicao ? edicao.preco.toFixed(2) : '');
    setEstoque(edicao ? String(edicao.qtd_estoque) : '');
    setImagemUrl(edicao?.imagem_url ?? '');
    setFoto(null);
    setErro('');
    const t = setTimeout(() => nomeRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [produto]);

  const carregarFoto = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErro('Selecione um arquivo de imagem (JPG, PNG ou WEBP).');
      return;
    }
    if (file.size > LIMITE_FOTO) {
      setErro('A foto deve ter no máximo 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setFoto({ dataUrl: String(ev.target?.result ?? ''), nome: file.name, tamanho: (file.size / 1024).toFixed(0) + ' KB' });
      setErro('');
    };
    reader.readAsDataURL(file);
  };

  const aoSoltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setBordaZona('');
    const file = e.dataTransfer.files[0];
    if (file) carregarFoto(file);
  };

  const salvar = async () => {
    const n = nome.trim();
    const valor = Number(preco.replace(',', '.'));
    const qtd = estoque.trim() === '' ? 0 : Number(estoque.replace(',', '.'));
    if (!n) return setErro('Informe a descrição do produto.');
    if (preco.trim() === '' || Number.isNaN(valor) || valor < 0) return setErro('Informe um custo unitário válido (≥ 0).');
    if (Number.isNaN(qtd) || qtd < 0) return setErro('Informe um estoque válido (≥ 0).');

    const dados: DadosProdutoProprio = {
      nome: n,
      fornecedor: fornecedor.trim() || FORNECEDOR_PROPRIO,
      preco: valor,
      qtd_estoque: qtd,
      imagem_url: imagemUrl.trim(),
    };
    if (foto) dados.imagem_upload = foto.dataUrl;

    setSalvando(true);
    setErro('');
    try {
      const p = edicao
        ? await api.alterarProdutoProprio(edicao.codigo, dados)
        : await api.criarProdutoProprio(dados);
      salvo(p, !edicao);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  // Imagem mostrada na prévia: foto nova > URL informada
  const previa = foto?.dataUrl || imagemUrl.trim();

  return (
    <div
      id="produto-modal"
      className={`custom-modal-backdrop${aberto ? ' open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div className="custom-modal-card">
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{edicao ? `Alterar produto ${edicao.codigo}` : 'Novo produto próprio'}</h3>
          <button className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        <p className="custom-modal-sub">
          {edicao
            ? 'Altere os dados e clique em Salvar. O código não muda.'
            : 'O código (PDP-000001, PDP-000002…) é gerado automaticamente ao salvar.'}
        </p>

        <div className="custom-modal-row">
          <div className="custom-modal-field" style={{ width: 150 }}>
            <label className="custom-modal-label">Código</label>
            <input className="custom-input" value={edicao?.codigo ?? 'Automático'} disabled />
          </div>
          <div className="custom-modal-field" style={{ flex: 1 }}>
            <label className="custom-modal-label">Fornecedor</label>
            <input
              id="produto-fornecedor"
              className="custom-input"
              type="text"
              list="fornecedores-proprios"
              maxLength={20}
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
            />
            <datalist id="fornecedores-proprios">
              <option value={FORNECEDOR_PROPRIO} />
              <option value="LOCAL" />
              <option value="IMPORTADO" />
            </datalist>
          </div>
        </div>

        <div className="custom-modal-field">
          <label className="custom-modal-label">Descrição do produto *</label>
          <input
            ref={nomeRef}
            id="produto-nome"
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
            <label className="custom-modal-label">Custo unitário (R$) *</label>
            <input
              id="produto-preco"
              className="custom-input"
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
            />
          </div>
          <div className="custom-modal-field" style={{ flex: 1 }}>
            <label className="custom-modal-label">Estoque (unidades)</label>
            <input
              id="produto-estoque"
              className="custom-input"
              type="number"
              min="0"
              step="1"
              placeholder="0"
              value={estoque}
              onChange={(e) => setEstoque(e.target.value)}
            />
          </div>
        </div>

        <div className="custom-modal-field">
          <label className="custom-modal-label">Foto do produto (opcional — usada no Catálogo e no Mockup)</label>
          <div
            className={`custom-foto-zone${previa ? ' has-foto' : ''}`}
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
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: 'none' }}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) carregarFoto(file);
                e.target.value = '';
              }}
            />
            {previa ? (
              <div className="custom-foto-preview-wrap" style={{ display: 'flex' }}>
                <img className="custom-foto-preview" src={previa} alt="Foto" />
                <div className="custom-foto-preview-info">
                  <div className="custom-foto-preview-name">{foto ? foto.nome : 'Imagem atual'}</div>
                  <div className="custom-foto-preview-size">
                    {foto ? `${foto.tamanho} · será enviada ao salvar` : 'Clique para trocar'}
                  </div>
                </div>
                <button
                  className="btn-remove-foto"
                  title="Remover foto"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFoto(null);
                    setImagemUrl('');
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '1.6rem', marginBottom: 4 }}>📷</div>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--berinjela)' }}>
                  Clique ou arraste a foto aqui
                </div>
                <div style={{ fontSize: '.71rem', color: 'var(--muted)', marginTop: 2 }}>JPG, PNG ou WEBP — máx. 5 MB</div>
              </div>
            )}
          </div>
          <input
            id="produto-imagem-url"
            className="custom-input"
            style={{ marginTop: 8 }}
            type="url"
            placeholder="…ou cole o endereço de uma imagem (https://…)"
            value={foto || imagemUrl.startsWith('/static/') ? '' : imagemUrl}
            disabled={!!foto}
            onChange={(e) => setImagemUrl(e.target.value)}
          />
        </div>

        {erro && <div className="form-mensagem erro">{erro}</div>}

        <div className="custom-modal-actions">
          <button className="btn-secondary" onClick={fechar} type="button">
            Cancelar
          </button>
          <button className="btn-primary" id="btn-salvar-produto" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Cadastrar produto'}
          </button>
        </div>
      </div>
    </div>
  );
}
