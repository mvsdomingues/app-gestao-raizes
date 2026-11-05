import { useEffect, useState } from 'react';
import { IMPRESSAO_DEFAULTS, LIMITES_IMPRESSAO, type ParametrosImpressao as Valores } from '@raizes/shared';
import { api } from '../../lib/api';
import { invalidarParametrosImpressao } from '../orcamentos/impressao';

function dataBr(v: string): string {
  return v.replace(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d:\d\d).*/, '$3/$2/$1 às $4');
}

/** Aba "Impressão" da tela Parâmetros: textos da folha impressa do orçamento. */
export function ParametrosImpressao({ visitas }: { visitas: number }) {
  const [gravado, setGravado] = useState<Valores | null>(null);
  const [form, setForm] = useState<Valores>(IMPRESSAO_DEFAULTS);
  const [atualizado, setAtualizado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    setMensagem(null);
    api.parametrosImpressao().then(
      (r) => {
        setGravado(r.valores);
        setForm(r.valores);
        setAtualizado(r.atualizado);
      },
      (e: Error) => setMensagem({ tipo: 'erro', texto: e.message }),
    );
  }, [visitas]);

  const alterado = !!gravado && JSON.stringify(form) !== JSON.stringify(gravado);
  const mudar = (campo: keyof Valores, v: string) => {
    setForm((f) => ({ ...f, [campo]: v }));
    setMensagem(null);
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await api.salvarParametrosImpressao(form);
      setGravado(r.valores);
      setForm(r.valores);
      setAtualizado(r.atualizado);
      invalidarParametrosImpressao();
      setMensagem({ tipo: 'ok', texto: '✓ Textos da impressão salvos. Valem para todos os orçamentos, inclusive os já enviados.' });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  const campo = (c: keyof Valores, titulo: string, ajuda: string, linhas: number, exemplo: string) => (
    <div className="param-texto">
      <label htmlFor={`param-${c}`} className="param-texto-titulo">
        {titulo}
      </label>
      <p className="param-opcao-sub">{ajuda}</p>
      <textarea
        id={`param-${c}`}
        className="custom-input"
        rows={linhas}
        maxLength={LIMITES_IMPRESSAO[c]}
        placeholder={exemplo}
        value={form[c]}
        disabled={!gravado}
        onChange={(e) => mudar(c, e.target.value)}
      />
      <span className="param-contador">
        {form[c].length.toLocaleString('pt-BR')} / {LIMITES_IMPRESSAO[c].toLocaleString('pt-BR')}
      </span>
    </div>
  );

  return (
    <div className="update-panel param-panel param-impressao" id="param-impressao">
      <div className="update-panel-header">
        <div>
          <h3 className="update-panel-title">Impressão do orçamento</h3>
          <p className="update-panel-sub">{atualizado ? `Última alteração: ${dataBr(atualizado)}` : 'Nenhum texto cadastrado ainda.'}</p>
        </div>
      </div>

      {campo(
        'instrucoes_especiais',
        'Instruções especiais',
        'Seção que aparece só na versão impressa / PDF do orçamento (inclusive na impressão feita pelo cliente no link), depois dos valores e dos mockups. Deixe vazio para não exibir.',
        7,
        'Ex.: Condições de pagamento: 50% na aprovação e 50% na entrega.\nPrazo de produção começa após a aprovação do layout.\nFrete por conta do cliente para fora da Grande São Paulo.',
      )}
      {campo(
        'rodape',
        'Rodapé',
        'Texto no fim do documento, abaixo da validade do orçamento (na tela e na impressão). Deixe vazio para não exibir.',
        3,
        'Ex.: Raízes Personalizados · CNPJ 00.000.000/0001-00 · (11) 99999-9999 · contato@raizes.com.br',
      )}

      {mensagem && <div className={`form-mensagem ${mensagem.tipo}`}>{mensagem.texto}</div>}

      <div className="param-acoes">
        <button
          className="btn-secondary"
          type="button"
          disabled={!gravado || !alterado}
          onClick={() => {
            if (gravado) setForm(gravado);
            setMensagem(null);
          }}
        >
          Desfazer alterações
        </button>
        <button className="btn-update" id="btn-salvar-impressao" onClick={() => void salvar()} disabled={salvando || !alterado}>
          {salvando ? 'Salvando…' : 'Salvar textos'}
        </button>
      </div>
    </div>
  );
}
