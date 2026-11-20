import { useEffect, useState } from 'react';
import { textoDias, type StatusExpiracao } from '@raizes/shared';
import { api } from '../../lib/api';
import { formatarDataHora } from '../pedidos/comum';

/** Cartão "Expiração de orçamentos": validade, última execução da rotina, quantos expiraram e a próxima. */
export function PainelExpiracao({ visivel }: { visivel: boolean }) {
  const [s, setS] = useState<StatusExpiracao | null>(null);

  useEffect(() => {
    if (!visivel) return;
    api.statusExpiracao().then(setS, () => setS(null)); // sem permissão: o cartão some
  }, [visivel]);

  if (!s) return null;
  const u = s.ultima;
  const situacao = !u
    ? 'A rotina ainda não foi executada.'
    : !u.ok
      ? `A última execução falhou (${formatarDataHora(u.inicio)}).`
      : s.alerta
        ? `A rotina não roda há mais de ${s.intervalo_min * 2} minutos: confira se o sistema está no ar.`
        : null;

  return (
    <div className={`update-panel painel-backup painel-expiracao${s.alerta ? ' alerta' : ''}`} id="painel-expiracao">
      <div className="update-panel-header">
        <div>
          <h3 className="update-panel-title">Expiração de orçamentos</h3>
          <p className="update-panel-sub">
            A cada {s.intervalo_min} minutos, os orçamentos enviados há mais de {textoDias(s.dias_validade)} sem resposta são
            cancelados automaticamente (expiram). A validade fica em Parâmetros › Sistema.
          </p>
        </div>
        <span className={`status-pill ${s.alerta ? 'err' : 'ok'}`} id="expiracao-situacao">
          {s.alerta ? '✘ Atenção' : '✓ Em dia'}
        </span>
      </div>
      {situacao && (
        <div className="painel-backup-aviso" id="expiracao-aviso">
          {situacao}
          {u?.erro && <div className="painel-backup-erro">{u.erro}</div>}
        </div>
      )}
      <div className="painel-backup-info">
        <div>
          <span>Última execução</span>
          <b id="expiracao-ultima">
            {u ? (
              <>
                {formatarDataHora(u.inicio)} · {u.ok ? 'concluída' : 'falhou'}
              </>
            ) : (
              '—'
            )}
          </b>
        </div>
        <div>
          <span>Expirados na última execução</span>
          <b id="expiracao-expirados">{u?.ok ? u.expirados : '—'}</b>
        </div>
        <div>
          <span>Próxima execução</span>
          <b id="expiracao-proxima">{s.proxima ? formatarDataHora(s.proxima) : 'rotina parada'}</b>
        </div>
      </div>
      {u && !u.ok && s.ultima_ok && (
        <p className="painel-backup-pasta">Última execução sem erro: {formatarDataHora(s.ultima_ok)}.</p>
      )}
    </div>
  );
}
