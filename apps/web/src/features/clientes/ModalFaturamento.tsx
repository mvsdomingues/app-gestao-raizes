import { useEffect, useState } from 'react';
import {
  faturamentoVazio,
  normalizarFaturamento,
  validarFaturamento,
  type CampoFaturamento,
  type ErrosFaturamento,
  type DadosFaturamento,
} from '@raizes/shared';
import { FormularioFaturamento } from './FormularioFaturamento';

interface Props {
  aberto: boolean;
  titulo: string;
  subtitulo?: string;
  inicial: DadosFaturamento | null;
  /** Exige todos os obrigatórios (pedido); sem ele, só confere o que foi digitado (orçamento) */
  completo: boolean;
  textoSalvar?: string;
  fechar: () => void;
  /** Recebe os dados normalizados (null = nada preenchido); erro lançado aparece no rodapé */
  salvar: (d: DadosFaturamento | null) => Promise<void> | void;
}

/** Modal com o formulário de faturamento e entrega (carrinho e pedido). */
export function ModalFaturamento({
  aberto,
  titulo,
  subtitulo,
  inicial,
  completo,
  textoSalvar = 'Salvar',
  fechar,
  salvar,
}: Props) {
  const [dados, setDados] = useState<DadosFaturamento>(inicial ?? faturamentoVazio());
  const [erros, setErros] = useState<ErrosFaturamento>({});
  const [falha, setFalha] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDados(inicial ?? faturamentoVazio());
    setErros({});
    setFalha('');
  }, [aberto]);

  const confirmar = async () => {
    const d = normalizarFaturamento(dados);
    const e = d ? validarFaturamento(d, completo) : completo ? validarFaturamento(dados, true) : {};
    setErros(e);
    if (Object.keys(e).length) {
      setFalha('Confira os campos destacados.');
      return;
    }
    setSalvando(true);
    setFalha('');
    try {
      await salvar(d);
      fechar();
    } catch (er) {
      setFalha(er instanceof Error ? er.message : String(er));
    } finally {
      setSalvando(false);
    }
  };

  if (!aberto) return null;
  return (
    <div
      className="custom-modal-backdrop open"
      id="modal-faturamento"
      onClick={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div className="custom-modal-card fat-modal" role="dialog" aria-label={titulo}>
        <div className="custom-modal-header">
          <h3 className="custom-modal-title">{titulo}</h3>
          <button className="custom-modal-close" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>
        {subtitulo && <p className="custom-modal-sub">{subtitulo}</p>}
        <FormularioFaturamento valor={dados} mudar={setDados} erros={erros} obrigatorio={completo} prefixo="modal-fat" />
        {falha && <div className="form-mensagem erro">{falha}</div>}
        <div className="custom-modal-actions">
          <button className="btn-secondary" type="button" onClick={fechar}>
            Cancelar
          </button>
          <button
            className="btn-primary"
            type="button"
            id="btn-salvar-faturamento"
            disabled={salvando}
            onClick={() => void confirmar()}
          >
            {salvando ? 'Salvando…' : textoSalvar}
          </button>
        </div>
      </div>
    </div>
  );
}
