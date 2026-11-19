import { useRef, useState } from 'react';
import {
  entregaPreenchida,
  entregaVazia,
  formatarTelefone,
  normalizarDocumento,
  rotuloEntrega,
  rotuloFaturamento,
  UFS,
  type CampoEntrega,
  type CampoFaturamento,
  type DadosFaturamento,
  type EnderecoEntrega,
  type ErrosFaturamento,
  type TipoPessoa,
} from '@raizes/shared';

const soDigitos = (s: string) => s.replace(/\D/g, '');

/** Máscara do CPF/CNPJ enquanto digita (CNPJ pode ter letras: formato alfanumérico da Receita). */
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
    .replace(/^(\w{2})(\w)/, '$1.$2')
    .replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3')
    .replace(/^(\w{2})\.(\w{3})\.(\w{3})(\w)/, '$1.$2.$3/$4')
    .replace(/\/(\w{4})(\w{1,2})$/, '/$1-$2');
}

const mascaraCep = (d: string) => d.slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

interface Props {
  valor: DadosFaturamento;
  mudar: (v: DadosFaturamento) => void;
  /** Erros por campo (validarFaturamento) */
  erros?: ErrosFaturamento;
  /** Marca os campos obrigatórios (aceite pelo cliente / pedido) */
  obrigatorio?: boolean;
  /** Prefixo dos ids (vários formulários na mesma página) */
  prefixo: string;
  desabilitado?: boolean;
  /** Ficha do cliente: a entrega é o endereço padrão do cadastro */
  entregaPadrao?: boolean;
}

/** Consulta pública do ViaCEP: rua, bairro, cidade e UF do CEP (null = não encontrado). */
async function consultarCep(
  cep: string,
): Promise<{ logradouro?: string; bairro?: string; localidade?: string; uf?: string } | null> {
  const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) });
  const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
  return j.erro ? null : j;
}

/**
 * Dados de faturamento e entrega do cliente (empresa ou pessoa física).
 * O CEP completa o endereço pela consulta pública do ViaCEP.
 */
export function FormularioFaturamento({
  valor,
  mudar,
  erros = {},
  obrigatorio = false,
  prefixo,
  desabilitado = false,
  entregaPadrao = false,
}: Props) {
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
      const j = await consultarCep(cep);
      if (!j) {
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

  const campo = (
    c: CampoFaturamento,
    extra: {
      tipo?: string;
      inputMode?: 'numeric' | 'email' | 'text';
      autoComplete?: string;
      classe?: string;
      placeholder?: string;
      dica?: string;
    } = {},
  ) => {
    const id = `${prefixo}-${c}`;
    const valorCampo =
      c === 'documento' ? mascaraDocumento(valor.documento, tipo) : c === 'cep' ? mascaraCep(valor.cep) : valor[c];
    return (
      <div className={`fat-campo fat-${c}${erros[c] ? ' com-erro' : ''} ${extra.classe ?? ''}`}>
        <label htmlFor={id}>
          {rotuloFaturamento(c, tipo)}
          {obrigatorio && !opcionais.includes(c) ? (
            <span className="fat-obrig"> *</span>
          ) : opcionais.includes(c) ? (
            <span className="fat-opc"> (opcional)</span>
          ) : null}
        </label>
        <input
          id={id}
          type={extra.tipo ?? 'text'}
          inputMode={extra.inputMode}
          autoCapitalize={c === 'documento' && tipo === 'PJ' ? 'characters' : undefined}
          autoComplete={extra.autoComplete}
          placeholder={extra.placeholder}
          value={valorCampo}
          disabled={desabilitado}
          aria-invalid={!!erros[c]}
          aria-describedby={erros[c] ? `${id}-erro` : undefined}
          onChange={(e) => {
            const v = e.target.value;
            if (c === 'documento') alterar({ documento: normalizarDocumento(v, tipo).slice(0, tipo === 'PF' ? 11 : 14) });
            else if (c === 'cep') {
              const cep = soDigitos(v).slice(0, 8);
              alterar({ cep });
              if (cep.length === 8) void buscarCep(cep);
            } else alterar({ [c]: v } as Partial<DadosFaturamento>);
          }}
        />
        {c === 'cep' && (buscandoCep || avisoCep) && (
          <span className="fat-dica">{buscandoCep ? 'Buscando endereço…' : avisoCep}</span>
        )}
        {extra.dica && !erros[c] && <span className="fat-dica">{extra.dica}</span>}
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
        {campo('documento', {
          inputMode: tipo === 'PJ' ? 'text' : 'numeric',
          placeholder: tipo === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00',
          dica: tipo === 'PJ' ? 'Pode ter letras (formato novo da Receita)' : undefined,
        })}
        {tipo === 'PJ' && campo('contato', { autoComplete: 'name' })}
        {campo('email', { tipo: 'email', inputMode: 'email', autoComplete: 'email', classe: tipo === 'PJ' ? '' : 'largo' })}
      </div>
      <div className="fat-subtitulo">Endereço de faturamento</div>
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
          <select
            id={`${prefixo}-uf`}
            value={valor.uf}
            disabled={desabilitado}
            onChange={(e) => alterar({ uf: e.target.value })}
            aria-invalid={!!erros.uf}
          >
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
      <BlocoEntrega
        valor={valor.entrega ?? null}
        mudar={(entrega) => mudar({ ...valor, entrega })}
        erros={erros}
        obrigatorio={obrigatorio}
        prefixo={prefixo}
        desabilitado={desabilitado}
        padrao={entregaPadrao}
      />
    </div>
  );
}

/**
 * Entrega: "no mesmo endereço do faturamento" (marcado por padrão) ou outro endereço,
 * com quem recebe, telefone e observação opcionais. O CEP completa o endereço.
 */
function BlocoEntrega({
  valor,
  mudar,
  erros,
  obrigatorio,
  prefixo,
  desabilitado,
  padrao,
}: {
  valor: EnderecoEntrega | null;
  mudar: (e: EnderecoEntrega | null) => void;
  erros: ErrosFaturamento;
  obrigatorio: boolean;
  prefixo: string;
  desabilitado: boolean;
  padrao: boolean;
}) {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState('');
  const ultimoCep = useRef('');
  const outro = valor !== null;
  const e = valor ?? entregaVazia();
  const opcionais: CampoEntrega[] = ['complemento', 'recebedor', 'telefone', 'observacao'];
  const alterar = (patch: Partial<EnderecoEntrega>) => mudar({ ...e, ...patch });

  const buscarCep = async (cep: string) => {
    if (cep.length !== 8 || cep === ultimoCep.current) return;
    ultimoCep.current = cep;
    setBuscandoCep(true);
    setAvisoCep('');
    try {
      const j = await consultarCep(cep);
      if (!j) {
        setAvisoCep('CEP não encontrado — preencha o endereço.');
        return;
      }
      mudar({
        ...e,
        cep,
        logradouro: j.logradouro || e.logradouro,
        bairro: j.bairro || e.bairro,
        cidade: j.localidade || e.cidade,
        uf: j.uf || e.uf,
      });
    } catch {
      setAvisoCep('Não foi possível consultar o CEP — preencha o endereço.');
    } finally {
      setBuscandoCep(false);
    }
  };

  const campo = (
    c: CampoEntrega,
    extra: { inputMode?: 'numeric' | 'tel' | 'text'; autoComplete?: string; classe?: string; placeholder?: string } = {},
  ) => {
    const id = `${prefixo}-entrega-${c}`;
    const erro = erros[`entrega_${c}`];
    const v = c === 'cep' ? mascaraCep(e.cep) : c === 'telefone' ? formatarTelefone(e.telefone) || e.telefone : e[c];
    return (
      <div className={`fat-campo fat-${c}${erro ? ' com-erro' : ''} ${extra.classe ?? ''}`}>
        <label htmlFor={id}>
          {rotuloEntrega(c)}
          {obrigatorio && !opcionais.includes(c) ? (
            <span className="fat-obrig"> *</span>
          ) : opcionais.includes(c) ? (
            <span className="fat-opc"> (opcional)</span>
          ) : null}
        </label>
        <input
          id={id}
          type="text"
          inputMode={extra.inputMode}
          autoComplete={extra.autoComplete}
          placeholder={extra.placeholder}
          value={v}
          disabled={desabilitado}
          aria-invalid={!!erro}
          onChange={(ev) => {
            const t = ev.target.value;
            if (c === 'cep') {
              const cep = soDigitos(t).slice(0, 8);
              alterar({ cep });
              if (cep.length === 8) void buscarCep(cep);
            } else if (c === 'telefone') alterar({ telefone: soDigitos(t).slice(0, 13) });
            else alterar({ [c]: t } as Partial<EnderecoEntrega>);
          }}
        />
        {c === 'cep' && (buscandoCep || avisoCep) && (
          <span className="fat-dica">{buscandoCep ? 'Buscando endereço…' : avisoCep}</span>
        )}
        {erro && <span className="fat-erro">{erro}</span>}
      </div>
    );
  };

  return (
    <div className="fat-entrega" id={`${prefixo}-entrega`}>
      <div className="fat-subtitulo">{padrao ? 'Endereço de entrega padrão' : 'Entrega'}</div>
      <label className="fat-entrega-mesmo">
        <input
          type="checkbox"
          id={`${prefixo}-entrega-mesmo`}
          checked={!outro}
          disabled={desabilitado}
          onChange={(ev) => mudar(ev.target.checked ? null : entregaVazia())}
        />
        Entregar no mesmo endereço do faturamento
      </label>
      {outro && (
        <div className="fat-grade">
          {campo('cep', { inputMode: 'numeric', autoComplete: 'off', placeholder: '00000-000' })}
          {campo('logradouro', { autoComplete: 'off' })}
          {campo('numero', { autoComplete: 'off' })}
          {campo('complemento', { autoComplete: 'off' })}
          {campo('bairro')}
          {campo('cidade', { autoComplete: 'off' })}
          <div className={`fat-campo fat-uf${erros.entrega_uf ? ' com-erro' : ''}`}>
            <label htmlFor={`${prefixo}-entrega-uf`}>
              {rotuloEntrega('uf')}
              {obrigatorio && <span className="fat-obrig"> *</span>}
            </label>
            <select
              id={`${prefixo}-entrega-uf`}
              value={e.uf}
              disabled={desabilitado}
              onChange={(ev) => alterar({ uf: ev.target.value })}
              aria-invalid={!!erros.entrega_uf}
            >
              <option value="">—</option>
              {UFS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            {erros.entrega_uf && <span className="fat-erro">{erros.entrega_uf}</span>}
          </div>
          {campo('recebedor', { autoComplete: 'off' })}
          {campo('telefone', { inputMode: 'tel', autoComplete: 'off', placeholder: '(00) 00000-0000' })}
          {campo('observacao', { classe: 'largo', placeholder: 'Horário, portaria, ponto de referência…' })}
        </div>
      )}
    </div>
  );
}

/** Endereço em duas linhas (rua/complemento/bairro e cidade/CEP). */
function LinhasEndereco({
  d,
}: {
  d: Pick<EnderecoEntrega, 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf'>;
}) {
  const rua = [d.logradouro, d.numero].filter(Boolean).join(', ');
  const cidade = [d.cidade, d.uf].filter(Boolean).join('/');
  return (
    <>
      {[rua, d.complemento, d.bairro].filter(Boolean).join(' – ')}
      {(cidade || d.cep) && (
        <>
          <br />
          {[cidade, d.cep ? `CEP ${mascaraCep(d.cep)}` : ''].filter(Boolean).join(' · ')}
        </>
      )}
    </>
  );
}

/** Resumo de leitura dos dados de faturamento e da entrega. */
export function ResumoFaturamento({ dados }: { dados: DadosFaturamento }) {
  const doc = dados.documento ? mascaraDocumento(dados.documento, dados.tipo_pessoa) : '';
  const temEndereco = !!(dados.logradouro || dados.cidade || dados.cep);
  const e = entregaPreenchida(dados.entrega) ? dados.entrega : null;
  return (
    <dl className="fat-resumo">
      <div>
        <dt>{dados.tipo_pessoa === 'PJ' ? 'Empresa' : 'Nome'}</dt>
        <dd>
          {dados.nome || '—'}
          {doc && (
            <span className="fat-resumo-doc">
              {' '}
              · {dados.tipo_pessoa === 'PJ' ? 'CNPJ' : 'CPF'} {doc}
            </span>
          )}
        </dd>
      </div>
      {(dados.contato || dados.email) && (
        <div>
          <dt>Contato</dt>
          <dd>{[dados.contato, dados.email].filter(Boolean).join(' · ')}</dd>
        </div>
      )}
      {temEndereco && (
        <div>
          <dt>Faturamento</dt>
          <dd>
            <LinhasEndereco d={dados} />
          </dd>
        </div>
      )}
      <div>
        <dt>Entrega</dt>
        <dd>
          {e ? (
            <>
              <LinhasEndereco d={e} />
              {(e.recebedor || e.telefone) && (
                <>
                  <br />
                  Recebe: {[e.recebedor, e.telefone ? formatarTelefone(e.telefone) : ''].filter(Boolean).join(' · ')}
                </>
              )}
              {e.observacao && (
                <>
                  <br />
                  {e.observacao}
                </>
              )}
            </>
          ) : (
            <span className="fat-resumo-mesmo">No mesmo endereço do faturamento</span>
          )}
        </dd>
      </div>
    </dl>
  );
}
