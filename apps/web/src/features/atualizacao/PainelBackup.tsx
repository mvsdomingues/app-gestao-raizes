import { useEffect, useState } from 'react';
import { HORAS_ALERTA_BACKUP, type StatusBackup } from '@raizes/shared';
import { api } from '../../lib/api';
import { formatarDataHora } from '../pedidos/comum';

const mb = (b: number) =>
  `${(b / 1024 / 1024).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;

/** Cartão "Backup da base": último backup diário, conferência, cópia externa e as cópias guardadas no servidor. */
export function PainelBackup({ visivel }: { visivel: boolean }) {
  const [s, setS] = useState<StatusBackup | null>(null);
  const [verCopias, setVerCopias] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    api.statusBackup().then(setS, () => setS(null)); // sem permissão ou sem a rota: o cartão some
  }, [visivel]);

  if (!s) return null;
  const u = s.ultima;
  const situacao = !s.ultima_ok
    ? 'Nenhum backup registrado ainda.'
    : u && !u.ok
      ? `O último backup falhou (${formatarDataHora(u.inicio)}).`
      : u?.externo && !u.externo.ok
        ? 'Backup feito no servidor, mas a cópia externa falhou.'
        : s.alerta
          ? `Sem backup há mais de ${HORAS_ALERTA_BACKUP} horas: confira o agendamento no servidor.`
          : null;

  return (
    <div className={`update-panel painel-backup${s.alerta ? ' alerta' : ''}`} id="painel-backup">
      <div className="update-panel-header">
        <div>
          <h3 className="update-panel-title">Backup da base</h3>
          <p className="update-panel-sub">
            Cópia automática e conferida da base de dados, todo dia de madrugada. Ficam guardados os últimos {s.dias} dias
            {s.destino_externo ? ', no servidor e fora dele' : ' no servidor'}.
          </p>
        </div>
        <span className={`status-pill ${s.alerta ? 'err' : 'ok'}`} id="backup-situacao">
          {s.alerta ? '✘ Atenção' : '✓ Em dia'}
        </span>
      </div>
      {situacao && (
        <div className="painel-backup-aviso" id="backup-aviso">
          {situacao}
          {u?.erro && <div className="painel-backup-erro">{u.erro}</div>}
          {u?.externo && !u.externo.ok && <div className="painel-backup-erro">{u.externo.mensagem}</div>}
        </div>
      )}
      <div className="painel-backup-info">
        <div>
          <span>Último backup</span>
          <b id="backup-ultimo">
            {u?.ok && u.arquivo ? (
              <>
                {formatarDataHora(u.inicio)} · {mb(u.tamanho ?? 0)} · conferido
              </>
            ) : s.ultima_ok ? (
              <>último bom: {formatarDataHora(s.ultima_ok)}</>
            ) : (
              '—'
            )}
          </b>
        </div>
        <div>
          <span>Cópias guardadas</span>
          <b id="backup-copias">
            {s.arquivos.length}
            {s.arquivos.length > 0 && (
              <button type="button" className="link-botao" onClick={() => setVerCopias((v) => !v)}>
                {verCopias ? 'ocultar' : 'ver'}
              </button>
            )}
          </b>
        </div>
        <div>
          <span>Cópia fora do servidor</span>
          <b id="backup-externo">
            {!s.destino_externo
              ? 'não configurada'
              : u?.externo
                ? `${u.externo.ok ? '✓' : '✘'} ${s.destino_externo}`
                : s.destino_externo}
          </b>
        </div>
      </div>
      {verCopias && (
        <ul className="painel-backup-lista" id="backup-lista">
          {s.arquivos.map((a) => (
            <li key={a.nome}>
              <span>{formatarDataHora(a.data)}</span>
              <code>{a.nome}</code>
              <span>{mb(a.tamanho)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="painel-backup-pasta">
        No servidor, em <code>{s.pasta}</code>. Para restaurar, veja o Manual (Ajuda › Manual › Backup da base).
      </p>
    </div>
  );
}
