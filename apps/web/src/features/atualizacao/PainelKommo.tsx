import { useEffect, useRef, useState } from 'react';
import type { StatusSincronizacaoClientes } from '@raizes/shared';
import { api } from '../../lib/api';
import { erroDe } from '../../lib/dialogo';
import { formatarDataHora } from '../pedidos/comum';

/** Cartão "Clientes do Kommo": situação da sincronização e botões para rodar agora. */
export function PainelKommo({ visivel }: { visivel: boolean }) {
  const [s, setS] = useState<StatusSincronizacaoClientes | null>(null);
  const [disparando, setDisparando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = async () => {
    try {
      const r = await api.statusSincronizacaoClientes();
      setS(r);
      // Enquanto sincroniza, acompanha a cada 2 s
      if (timer.current) clearTimeout(timer.current);
      if (r.rodando) timer.current = setTimeout(() => void carregar(), 2000);
    } catch {
      /* sem permissão ou servidor fora: o cartão some */
    }
  };

  useEffect(() => {
    if (visivel) void carregar();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [visivel]);

  if (!s) return null;

  const sincronizar = async (completa: boolean) => {
    setDisparando(true);
    try {
      setS(await api.sincronizarClientes(completa));
      timer.current = setTimeout(() => void carregar(), 1000);
    } catch (e) {
      void erroDe('Não foi possível iniciar a sincronização.', e);
    } finally {
      setDisparando(false);
    }
  };

  const u = s.ultima;
  return (
    <div className="update-panel painel-kommo" id="painel-kommo">
      <div className="update-panel-header">
        <div>
          <h3 className="update-panel-title">Clientes do Kommo</h3>
          <p className="update-panel-sub">
            {s.configurado ? (
              <>
                Cópia local dos contatos de <b>{s.subdominio}.kommo.com</b>, atualizada a cada {s.intervalo_min} min (e conferida por
                completo uma vez por dia).
              </>
            ) : (
              <>
                Integração desligada. Defina <code>KOMMO_SUBDOMINIO</code> e <code>KOMMO_TOKEN</code> no <code>.env</code> do servidor e
                reinicie.
              </>
            )}
          </p>
        </div>
        {s.configurado && (
          <div className="painel-kommo-botoes">
            <button
              id="btn-sincronizar-clientes"
              className="btn-update"
              disabled={s.rodando || disparando}
              onClick={() => void sincronizar(false)}
            >
              {s.rodando ? '⟳ Sincronizando…' : '⟳ Sincronizar clientes agora'}
            </button>
            <button
              type="button"
              className="link-botao"
              id="btn-sincronizar-completa"
              disabled={s.rodando || disparando}
              onClick={() => void sincronizar(true)}
              title="Relê todos os contatos e marca os que foram apagados no Kommo"
            >
              Conferência completa
            </button>
          </div>
        )}
      </div>
      {s.configurado && (
        <div className="painel-kommo-info" id="painel-kommo-info">
          <div>
            <span>Clientes na base</span>
            <b id="kommo-total">{s.total.toLocaleString('pt-BR')}</b>
          </div>
          <div>
            <span>Última sincronização</span>
            <b>
              {u ? (
                <>
                  {formatarDataHora(u.inicio)} · {u.tipo === 'completa' ? 'completa' : 'incremental'} ·{' '}
                  <span className={`kommo-status st-${u.status}`} id="kommo-status">
                    {u.status === 'OK' ? `✓ ${u.recebidos} recebidos` : u.status === 'EXECUTANDO' ? 'em andamento…' : '✗ erro'}
                  </span>
                </>
              ) : (
                'ainda não sincronizado'
              )}
            </b>
          </div>
          {u?.status === 'ERRO' && s.ultima_ok && (
            <div>
              <span>Último sucesso</span>
              <b>{formatarDataHora(s.ultima_ok)}</b>
            </div>
          )}
          {s.notas_pendentes > 0 && (
            <div>
              <span>Notas aguardando envio</span>
              <b>{s.notas_pendentes}</b>
            </div>
          )}
          {u?.mensagem && <div className={`painel-kommo-msg${u.status === 'ERRO' ? ' erro' : ''}`}>{u.mensagem}</div>}
        </div>
      )}
    </div>
  );
}
