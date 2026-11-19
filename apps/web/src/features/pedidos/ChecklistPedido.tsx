import { useState } from 'react';
import { ETAPA_CHECKLIST, ROTULOS_STATUS_PEDIDO, type Pedido } from '@raizes/shared';
import { useSessao } from '../../app/sessao';
import { useApp } from '../../app/contexto';
import { api } from '../../lib/api';
import { erroDe } from '../../lib/dialogo';
import { formatarDataHora } from './comum';

/**
 * Checklist de fechamento do pedido: marcável só na etapa "Em Fechamento"; nas outras
 * etapas aparece só para consulta. Não trava o fluxo (o pedido avança com itens em aberto).
 */
export function ChecklistPedido({ pedido: p, aoAlterar }: { pedido: Pedido; aoAlterar: (p: Pedido) => void }) {
  const { pode } = useSessao();
  const { irPara } = useApp();
  const [salvando, setSalvando] = useState<number | null>(null);
  const editavel = p.status === ETAPA_CHECKLIST;
  if (!editavel && !p.checklist.length) return null;

  const feitos = p.checklist.filter((i) => i.feito).length;
  const marcar = async (id: number, feito: boolean) => {
    setSalvando(id);
    // Marca na hora; a resposta do servidor confirma (ou desfaz, se falhar)
    aoAlterar({ ...p, checklist: p.checklist.map((i) => (i.id === id ? { ...i, feito } : i)) });
    try {
      aoAlterar(await api.marcarChecklistPedido(p.codigo, id, feito));
    } catch (e) {
      aoAlterar(p);
      void erroDe('Não foi possível salvar o checklist.', e);
    } finally {
      setSalvando(null);
    }
  };

  return (
    <div className={`pedido-checklist${editavel ? '' : ' leitura'}`} id="pedido-checklist">
      <div className="pedido-checklist-topo">
        <h3 className="pedido-secao">Checklist de fechamento</h3>
        {p.checklist.length > 0 && (
          <span className={`pedido-checklist-progresso${feitos === p.checklist.length ? ' completo' : ''}`} id="checklist-progresso">
            {feitos} de {p.checklist.length} {p.checklist.length === 1 ? 'item' : 'itens'}
          </span>
        )}
      </div>
      {!editavel && (
        <p className="pedido-checklist-nota">
          Só pode ser alterado com o pedido na etapa {ROTULOS_STATUS_PEDIDO[ETAPA_CHECKLIST]}.
        </p>
      )}
      {p.checklist.length === 0 ? (
        <p className="pedido-checklist-nota">
          Nenhum item no checklist. Cadastre os itens em <b>Parâmetros › Checklist de fechamento</b>
          {pode('parametros') && (
            <>
              {' '}
              <button className="link-botao" onClick={() => irPara('parametros')}>
                (abrir Parâmetros)
              </button>
            </>
          )}
          ; eles entram nos pedidos que chegarem a esta etapa a partir de então.
        </p>
      ) : (
        <ul className="pedido-checklist-lista">
          {p.checklist.map((i) => (
            <li key={i.id} className={i.feito ? 'feito' : ''}>
              <label>
                <input
                  type="checkbox"
                  checked={i.feito}
                  disabled={!editavel || salvando !== null}
                  onChange={(e) => void marcar(i.id, e.target.checked)}
                  data-item={i.id}
                />
                <span className="pedido-checklist-texto">{i.texto}</span>
              </label>
              {i.feito && i.feito_em && (
                <span className="pedido-checklist-quem">
                  {formatarDataHora(i.feito_em)}
                  {i.usuario && <> · {i.usuario.nome}</>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
