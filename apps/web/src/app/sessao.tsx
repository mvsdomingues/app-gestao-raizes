import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { IdTela, UsuarioSessao } from '@raizes/shared';
import { api, EVENTO_SESSAO_EXPIRADA } from '../lib/api';

interface ContextoSessao {
  /** undefined = verificando; null = não logado */
  usuario: UsuarioSessao | null | undefined;
  /** Mensagem mostrada na tela de login (ex.: sessão expirada). */
  aviso: string;
  entrar: (login: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  /** Atualiza os dados do usuário logado (após "Meus dados" ou mudança de acessos). */
  atualizar: (u?: UsuarioSessao) => Promise<void>;
  pode: (tela: IdTela) => boolean;
}

const Ctx = createContext<ContextoSessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSessao | null | undefined>(undefined);
  const [aviso, setAviso] = useState('');

  const atualizar = useCallback(async (u?: UsuarioSessao) => {
    if (u) return setUsuario(u);
    try {
      setUsuario(await api.sessao());
    } catch {
      setUsuario(null);
    }
  }, []);

  useEffect(() => {
    void atualizar();
    const expirou = () => {
      setUsuario((atual) => {
        if (atual) setAviso('Sua sessão expirou. Entre novamente.');
        return null;
      });
    };
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
  }, [atualizar]);

  const valor = useMemo<ContextoSessao>(
    () => ({
      usuario,
      aviso,
      entrar: async (login, senha) => {
        const u = await api.entrar(login, senha);
        setAviso('');
        setUsuario(u);
      },
      sair: async () => {
        try {
          await api.sair();
        } finally {
          setAviso('');
          setUsuario(null);
        }
      },
      atualizar,
      pode: (tela) => !!usuario?.permissoes.includes(tela),
    }),
    [usuario, aviso, atualizar],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSessao(): ContextoSessao {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSessao fora do ProvedorSessao');
  return c;
}
