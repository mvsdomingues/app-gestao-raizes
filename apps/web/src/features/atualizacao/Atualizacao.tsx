import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CHAVES_FORNECEDORES, ROTULOS_FORNECEDORES, type ChaveFornecedor } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { CartoesStatus } from './CartoesStatus';

const INTERVALO_MS = 1200;
const TEXTO_BOTAO = '⟳ Atualizar agora';

type Selecao = Record<ChaveFornecedor, boolean>;
const TODOS: Selecao = { asia: true, sm: true, spot: true, xbz: true };

/** Aba "Atualização": dispara a coleta dos fornecedores e acompanha o log. */
export function Atualizacao() {
  const { tela, carregarStatus, carregarFornecedores } = useApp();
  const [selecao, setSelecao] = useState<Selecao>(TODOS);
  const [botao, setBotao] = useState({ desabilitado: false, texto: TEXTO_BOTAO });
  const [progressoVisivel, setProgressoVisivel] = useState(false);
  const [estadoTexto, setEstadoTexto] = useState('Iniciando…');
  const [inicio, setInicio] = useState('');
  const [log, setLog] = useState('');
  const [fim, setFim] = useState<'' | 'done' | 'error'>('');

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const rolarAteFim = useRef(false);

  const pararPolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const iniciarPolling = () => {
    pararPolling();
    timer.current = setInterval(async () => {
      try {
        const s = await api.statusAtualizacao();
        const el = logRef.current;
        rolarAteFim.current = !!el && el.scrollHeight - el.scrollTop - el.clientHeight < 30;
        setLog(s.log || '(aguardando saída…)');
        if (s.iniciado_em) setInicio('Iniciado: ' + s.iniciado_em.replace('T', ' '));

        if (!s.running) {
          pararPolling();
          setBotao({ desabilitado: false, texto: TEXTO_BOTAO });
          if (s.return_code === 0) {
            setEstadoTexto('✓ Concluído');
            setFim('done');
          } else if (s.return_code !== null) {
            setEstadoTexto('✗ Erro (código ' + s.return_code + ')');
            setFim('error');
          }
          // recarrega cards de status e fornecedores
          void carregarStatus();
          void carregarFornecedores();
        }
      } catch (e) {
        console.error('Erro ao consultar status:', e);
      }
    }, INTERVALO_MS);
  };

  // Mantém o log rolado até o fim se o usuário já estava no fim
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && rolarAteFim.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  // Ao abrir a aplicação, retoma o acompanhamento se já houver atualização em andamento
  useEffect(() => {
    void (async () => {
      try {
        const s = await api.statusAtualizacao();
        if (s.running) {
          setBotao({ desabilitado: true, texto: '⟳ Em execução…' });
          setProgressoVisivel(true);
          iniciarPolling();
        }
      } catch {
        /* ignora */
      }
    })();
    return pararPolling;
  }, []);

  const iniciar = async () => {
    const selecionados = CHAVES_FORNECEDORES.filter((k) => selecao[k]);
    if (selecionados.length === 0) {
      alert('Selecione ao menos um fornecedor.');
      return;
    }
    setBotao({ desabilitado: true, texto: '⟳ Iniciando…' });
    try {
      const data = await api.iniciarAtualizacao(selecionados);
      if (!data.ok) {
        alert('Erro: ' + (data.msg || 'falha desconhecida'));
        setBotao({ desabilitado: false, texto: TEXTO_BOTAO });
        return;
      }
      setBotao({ desabilitado: true, texto: '⟳ Em execução…' });
      setProgressoVisivel(true);
      setEstadoTexto('Em execução…');
      setLog('');
      setFim('');
      iniciarPolling();
    } catch (e) {
      alert('Falha de rede: ' + (e instanceof Error ? e.message : e));
      setBotao({ desabilitado: false, texto: TEXTO_BOTAO });
    }
  };

  const marcarTodos = (marcar: boolean) =>
    setSelecao({ asia: marcar, sm: marcar, spot: marcar, xbz: marcar });

  return (
    <div id="view-status" style={{ display: tela === 'status' ? 'flex' : 'none' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div className="status-page-title">Base de Dados</div>
        <p className="status-page-sub">Selecione os fornecedores e atualize a base sob demanda.</p>

        <div className="update-panel">
          <div className="update-panel-header">
            <div>
              <h3 className="update-panel-title">Atualizar base de produtos</h3>
              <p className="update-panel-sub">
                Marque os fornecedores desejados e clique em <b>Atualizar agora</b>.
              </p>
            </div>
            <button id="btn-atualizar" className="btn-update" onClick={() => void iniciar()} disabled={botao.desabilitado}>
              {botao.texto}
            </button>
          </div>

          <div className="update-suppliers" id="update-suppliers">
            {CHAVES_FORNECEDORES.map((k) => (
              <label className="sup-check" key={k}>
                <input
                  type="checkbox"
                  value={k}
                  checked={selecao[k]}
                  onChange={(e) => setSelecao((s) => ({ ...s, [k]: e.target.checked }))}
                />{' '}
                {ROTULOS_FORNECEDORES[k]}
              </label>
            ))}
          </div>

          <div className="update-quick-actions">
            <button type="button" onClick={() => marcarTodos(true)}>
              Marcar todos
            </button>
            <span style={{ color: 'var(--border2)' }}>·</span>
            <button type="button" onClick={() => marcarTodos(false)}>
              Desmarcar todos
            </button>
          </div>

          <div id="update-progress" className="update-progress" style={{ display: progressoVisivel ? 'block' : 'none' }}>
            <div className="update-progress-bar">
              <div className={`update-progress-fill${fim ? ' ' + fim : ''}`} id="update-progress-fill" />
            </div>
            <div className="update-progress-info">
              <span id="update-state">{estadoTexto}</span>
              <span id="update-time">{inicio}</span>
            </div>
            <pre id="update-log" className="update-log" ref={logRef}>
              {log}
            </pre>
          </div>
        </div>

        <CartoesStatus />
      </div>
    </div>
  );
}
