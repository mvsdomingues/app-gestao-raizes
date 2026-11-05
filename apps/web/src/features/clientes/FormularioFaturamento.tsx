import { useRef, useState } from 'react';
import {
  rotuloFaturamento,
  UFS,
  type CampoFaturamento,
  type DadosFaturamento,
  type TipoPessoa,
} from '@raizes/shared';

const soDigitos = (s: string) => s.replace(/\D/g, '');

/** Máscara do CPF/CNPJ enquanto digita. */
function mascaraDocumento(d: string, tipo: TipoPessoa): string {
  if (tipo === 'PF') {
    return d
      .slice(0, 11)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

const mascaraCep = (d: string) => d.slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

interface Props {
  valor: DadosFaturamento;
  mudar: (v: DadosFaturamento) => void;
  /** Erros por campo (validarFaturamento) */
  erros?: Partial<Record<CampoFaturamento, string>>;
  /** Marca os campos obrigatórios (aceite pelo cliente / pedido) */
  obrigatorio?: boolean;
  /** Prefixo dos ids (vários formulários na mesma página) */
  prefixo: string;
  desabilitado?: boolean;
}

/**
 * Dados de faturamento e entrega do cliente (empresa ou pessoa física).
 * O CEP completa o endereço pela consulta pública do ViaCEP.
 */
export function FormularioFaturamento({ valor, mudar, erros = {}, obrigatorio = false, prefixo, desabilitado = false }: Props) {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState('');
  const ultimoCep = useRef('');
  const tipo = valor.tipo_pessoa;
  const opcionais: CampoFaturamento[] = ['contato', 'complemento'];

  const alterar = (patch: Partial<DadosFaturamento>) => mudar({ ...valor, ...patch });

  const buscarCep = async (cep: string) => {
    if (cep.length !== 8 || cep === ultimoCep.current) return;
    ultimoCep.current = cep;
    setBuscandoCep(true);
    setAvisoCep('');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) });
      const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (j.erro) {
        setAvisoCep('CEP não encontrado — preencha o endereço.');
        return;
      }
      mudar({
        ...valor,
        cep,
        logradouro: j.logradouro || valor.logradouro,
        bairro: j.bairro || valor.bairro,
        cidade: j.localidade || valor.cidade,
        uf: j.uf || valor.uf,
      });
    } catch {
      setAvisoCep('Não foi possível consultar o CEP — preencha o endereço.');
    } finally {
      setBuscandoCep(false);
    }
  };

  const campo = (c: CampoFaturamento, extra: { tipo?: string; inputMode?: 'numeric' | 'email' | 'text'; autoComplete?: string; classe?: string; placeholder?: string } = {}) => {
    const id = `${prefixo}-${c}`;
    const valorCampo = c === 'documento' ? mascaraDocumento(valor.documento, tipo) : c === 'cep' ? mascaraCep(valor.cep) : valor[c];
    return (
      <div className={`fat-campo fat-${c}${erros[c] ? ' com-erro' : ''} ${extra.classe ?? ''}`}>
        <label htmlFor={id}>
          {rotuloFaturamento(c, tipo)}
          {obrigatorio && !opcionais.includes(c) ? <span className="fat-obrig"> *</span> : opcionais.includes(c) ? <span className="fat-opc"> (opcional)</span> : null}
        </label>
        <input
          id={id}
          type={extra.tipo ?? 'text'}
          inputMode={extra.inputMode}
          autoComplete={extra.autoComplete}
          placeholder={extra.placeholder}
          value={valorCampo}
          disabled={desabilitado}
          aria-invalid={!!erros[c]}
          aria-describedby={erros[c] ? `${id}-erro` : undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (c === 'documento') alterar({ documento: soDigitos(v).slice(0, tipo === 'PF' ? 11 : 14) });
            else if (c === 'cep') {
              const cep = soDigitos(v).slice(0, 8);
              alterar({ cep });
              if (cep.length === 8) void buscarCep(cep);
            } else alterar({ [c]: v } as Partial<DadosFaturamento>);
          }}
        />
        {c === 'cep' && (buscandoCep || avisoCep) && <span className="fat-dica">{buscandoCep ? 'Buscando endereço…' : avisoCep}</span>}
        {erros[c] && (
          <span className="fat-erro" id={`${id}-erro`}>
            {erros[c]}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="fat-form">
      <div className="fat-tipo" role="radiogroup" aria-label="Tipo de cliente">
        {(['PJ', 'PF'] as TipoPessoa[]).map((t) => (
          <label key={t} className={`fat-tipo-opcao${tipo === t ? ' ativo' : ''}`}>
            <input
              type="radio"
              name={`${prefixo}-tipo`}
              value={t}
              checked={tipo === t}
              disabled={desabilitado}
              onChange={() => alterar({ tipo_pessoa: t, documento: '', contato: t === 'PF' ? '' : valor.contato })}
            />
            {t === 'PJ' ? 'Empresa (CNPJ)' : 'Pessoa física (CPF)'}
          </label>
        ))}
      </div>
      <div className="fat-grade">
        {campo('nome', { classe: 'largo', autoComplete: tipo === 'PJ' ? 'organization' : 'name' })}
        {campo('documento', { inputMode: 'numeric', placeholder: tipo === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00' })}
        {tipo === 'PJ' && campo('contato', { autoComplete: 'name' })}
        {campo('email', { tipo: 'email', inputMode: 'email', autoComplete: 'email', classe: tipo === 'PJ' ? '' : 'largo' })}
      </div>
      <div className="fat-subtitulo">Endereço de entrega</div>
      <div className="fat-grade">
        {campo('cep', { inputMode: 'numeric', autoComplete: 'postal-code', placeholder: '00000-000' })}
        {campo('logradouro', { autoComplete: 'address-line1' })}
        {campo('numero', { autoComplete: 'off' })}
        {campo('complemento', { autoComplete: 'address-line2' })}
        {campo('bairro')}
        {campo('cidade', { autoComplete: 'address-level2' })}
        <div className={`fat-campo fat-uf${erros.uf ? ' com-erro' : ''}`}>
          <label htmlFor={`${prefixo}-uf`}>
            {rotuloFaturamento('uf')}
            {obrigatorio && <span className="fat-obrig"> *</span>}
          </label>
          <select id={`${prefixo}-uf`} value={valor.uf} disabled={desabilitado} onChange={(e) => alterar({ uf: e.target.value })} aria-invalid={!!erros.uf}>
            <option value="">—</option>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          {erros.uf && <span className="fat-erro">{erros.uf}</span>}
        </div>
      </div>
    </div>
  );
}

/** Resumo de leitura dos dados de faturamento. */
export function ResumoFaturamento({ dados }: { dados: DadosFaturamento }) {
  const doc = dados.documento ? mascaraDocumento(dados.documento, dados.tipo_pessoa) : '';
  const rua = [dados.logradouro, dados.numero].filter(Boolean).join(', ');
  const cidade = [dados.cidade, dados.uf].filter(Boolean).join('/');
  return (
    <dl className="fat-resumo">
      <div>
        <dt>{dados.tipo_pessoa === 'PJ' ? 'Empresa' : 'Nome'}</dt>
        <dd>
          {dados.nome || '—'}
          {doc && <span className="fat-resumo-doc"> · {dados.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} {doc}</span>}
        </dd>
      </div>
      {(dados.contato || dados.email) && (
        <div>
          <dt>Contato</dt>
          <dd>{[dados.contato, dados.email].filter(Boolean).join(' · ')}</dd>
        </div>
      )}
      {(rua || cidade || dados.cep) && (
        <div>
          <dt>Entrega</dt>
          <dd>
            {[rua, dados.complemento, dados.bairro].filter(Boolean).join(' – ')}
            {(cidade || dados.cep) && (
              <>
                <br />
                {[cidade, dados.cep ? `CEP ${mascaraCep(dados.cep)}` : ''].filter(Boolean).join(' · ')}
              </>
            )}
          </dd>
        </div>
      )}
    </dl>
  );
}
