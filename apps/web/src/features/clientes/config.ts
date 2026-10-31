import { useEffect, useState } from 'react';
import type { ClienteKommo, ClienteVinculado, ConfigClientes } from '@raizes/shared';
import { api } from '../../lib/api';

const DESLIGADO: ConfigClientes = { ativo: false, subdominio: null };
let cache: Promise<ConfigClientes> | null = null;
let valor: ConfigClientes | null = null;

/** Integração com o Kommo ligada? (consulta uma vez por sessão do navegador) */
export function useConfigClientes(): ConfigClientes {
  const [c, setC] = useState<ConfigClientes>(valor ?? DESLIGADO);
  useEffect(() => {
    if (valor) return;
    cache ??= api.configClientes().then(
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

/** Contato da busca → dados gravados no orçamento. */
export function paraVinculo(c: ClienteKommo): ClienteVinculado {
  return { id: c.id, nome: c.nome, telefone: c.telefones[0] ?? null };
}
