import { useEffect, useState } from 'react';
import type { ClienteVinculado, ConfigClientes, ResumoCliente } from '@raizes/shared';
import { api } from '../../lib/api';

const DESLIGADO: ConfigClientes = { ativo: false, subdominio: null };
let cache: Promise<ConfigClientes> | null = null;
let valor: ConfigClientes | null = null;

/** Esquece a configuração (ex.: depois de mudar os parâmetros de sistema). */
export function invalidarConfigClientes(): void {
  cache = null;
  valor = null;
}

/** Integração com o Kommo ligada? (desligada por padrão; consulta uma vez por sessão do navegador) */
export function useConfigClientes(): ConfigClientes {
  const [c, setC] = useState<ConfigClientes>(valor ?? DESLIGADO);
  useEffect(() => {
    if (valor) return;
    cache ??= api.configKommo().then(
      (r) => (valor = r),
      () => {
        cache = null; // tenta de novo na próxima tela
        return DESLIGADO;
      },
    );
    let vivo = true;
    void cache.then((r) => vivo && setC(r));
    return () => {
      vivo = false;
    };
  }, []);
  return c;
}

/** Cliente da busca → dados gravados no orçamento. */
export function paraVinculo(c: Pick<ResumoCliente, 'id' | 'nome' | 'telefone' | 'email' | 'codigo'>): ClienteVinculado {
  return { id: c.id, nome: c.nome, telefone: c.telefone || null, email: c.email || null, codigo: c.codigo };
}
