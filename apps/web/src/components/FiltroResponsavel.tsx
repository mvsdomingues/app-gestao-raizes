import { useEffect, useState } from 'react';
import type { OpcaoResponsavel } from '@raizes/shared';
import { api } from '../lib/api';

/** Lista de usuários carregada uma vez por sessão da página (as duas telas usam a mesma). */
let cache: Promise<OpcaoResponsavel[]> | null = null;
function carregarResponsaveis(): Promise<OpcaoResponsavel[]> {
  cache ??= api.responsaveis().catch((e) => {
    cache = null; // tenta de novo na próxima vez
    throw e;
  });
  return cache;
}

/**
 * Filtro "Responsável" das listas de orçamentos e pedidos: escolhe o usuário que criou o registro.
 * Usuários inativos aparecem separados (continuam responsáveis pelos registros antigos).
 */
export function FiltroResponsavel({ id, valor, aoMudar }: { id: string; valor: string; aoMudar: (id: string) => void }) {
  const [opcoes, setOpcoes] = useState<OpcaoResponsavel[]>([]);
  useEffect(() => {
    carregarResponsaveis().then(setOpcoes, () => setOpcoes([]));
  }, []);
  const ativos = opcoes.filter((u) => !u.inativo);
  const inativos = opcoes.filter((u) => u.inativo);
  return (
    <select id={id} className="custom-input" value={valor} onChange={(e) => aoMudar(e.target.value)}>
      <option value="">Todos</option>
      {ativos.map((u) => (
        <option key={u.id} value={String(u.id)}>
          {u.nome}
        </option>
      ))}
      {inativos.length > 0 && (
        <optgroup label="Inativos">
          {inativos.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.nome}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
