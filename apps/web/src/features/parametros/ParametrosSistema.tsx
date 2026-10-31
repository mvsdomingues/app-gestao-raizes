import { useEffect, useState } from 'react';
import { SISTEMA_DEFAULTS, type ParametrosSistema as Valores } from '@raizes/shared';
import { api } from '../../lib/api';
import { invalidarConfigClientes, useConfigClientes } from '../clientes/config';

function dataBr(v: string): string {
  return v.replace(/^(\d{4})-(\d\d)-(\d\d)[ T](\d\d:\d\d).*/, '$3/$2/$1 às $4');
}

/** Aba "Sistema" da tela Parâmetros. */
export function ParametrosSistema({ visitas }: { visitas: number }) {
  const kommo = useConfigClientes();
  const [gravado, setGravado] = useState<Valores | null>(null);
  const [form, setForm] = useState<Valores>(SISTEMA_DEFAULTS);
  const [atualizado, setAtualizado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  // Recarrega ao abrir a aba ou a tela
  useEffect(() => {
    setMensagem(null);
    api.parametrosSistema().then(
      (r) => {
        setGravado(r.valores);
        setForm(r.valores);
        setAtualizado(r.atualizado);
      },
      (e: Error) => setMensagem({ tipo: 'erro', texto: e.message }),
    );
  }, [visitas]);

  const alterado = !!gravado && JSON.stringify(form) !== JSON.stringify(gravado);

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await api.salvarParametrosSistema(form);
      setGravado(r.valores);
      setForm(r.valores);
      setAtualizado(r.atualizado);
      invalidarConfigClientes();
      setMensagem({ tipo: 'ok', texto: '✓ Parâmetros de sistema salvos. Valem a partir de agora para todos os usuários.' });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="update-panel param-panel param-sistema" id="param-sistema">
      <div className="update-panel-header">
        <div>
          <h3 className="update-panel-title">Integração com o Kommo</h3>
          <p className="update-panel-sub">{atualizado ? `Última alteração: ${dataBr(atualizado)}` : 'Usando os valores padrão do sistema.'}</p>
        </div>
      </div>

      <label className="param-opcao" htmlFor="param-kommo_notas_ativo">
        <input
          type="checkbox"
          id="param-kommo_notas_ativo"
          checked={form.kommo_notas_ativo}
          disabled={!gravado}
          onChange={(e) => {
            setForm((f) => ({ ...f, kommo_notas_ativo: e.target.checked }));
            setMensagem(null);
          }}
        />
        <span>
          <b>Enviar notas para o Kommo</b>
          <span className="param-opcao-sub">
            Registra uma nota no contato do cliente quando o orçamento é enviado, quando o cliente aceita ou recusa pelo
            link e quando um pedido é gerado. Desligado, nenhuma nota é criada nem enviada; as que estavam aguardando
            reenvio ficam na fila até as notas serem ligadas de novo.
          </span>
          <span className={`param-estado ${form.kommo_notas_ativo ? 'ativo' : 'inativo'}`} id="param-kommo-estado">
            {form.kommo_notas_ativo ? 'Ativo' : 'Inativo'}
          </span>
        </span>
      </label>

      {!kommo.ativo && (
        <p className="param-nota">
          A integração com o Kommo está desligada no servidor (sem <code>KOMMO_SUBDOMINIO</code> e <code>KOMMO_TOKEN</code> no{' '}
          <code>.env</code>). Este parâmetro só vale quando ela estiver ligada.
        </p>
      )}

      {mensagem && <div className={`form-mensagem ${mensagem.tipo}`}>{mensagem.texto}</div>}

      <div className="param-acoes">
        <button
          className="btn-secondary"
          type="button"
          disabled={!gravado}
          onClick={() => {
            setForm(SISTEMA_DEFAULTS);
            setMensagem(null);
          }}
        >
          Restaurar padrões
        </button>
        <button className="btn-update" id="btn-salvar-sistema" onClick={() => void salvar()} disabled={salvando || !alterado}>
          {salvando ? 'Salvando…' : 'Salvar parâmetros'}
        </button>
      </div>
    </div>
  );
}
