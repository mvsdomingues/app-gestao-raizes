import { useEffect, useRef, useState } from 'react';
import { useSessao } from '../app/sessao';
import { FormularioUsuario } from '../features/usuarios/FormularioUsuario';

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const ini = (partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1]![0] : '');
  return ini.toUpperCase() || '?';
}

/** Ícone do usuário no canto superior direito: Meus dados e Sair. */
export function MenuUsuario() {
  const { usuario, sair, atualizar } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou com Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(''), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  if (!usuario) return null;

  return (
    <header className="app-topo">
      <div className="app-topo-esquerda">
        {usuario.senha_inicial && (
          <div className="aviso-senha-inicial" role="alert">
            ⚠ Você está usando a senha inicial. Por segurança, troque-a em{' '}
            <button className="link-botao" onClick={() => setEditando(true)}>
              Meus dados
            </button>
            .
          </div>
        )}
        {aviso && <div className="menu-usuario-toast">{aviso}</div>}
      </div>
      <div className="menu-usuario" ref={ref}>
        <button
          className={`menu-usuario-botao${aberto ? ' aberto' : ''}`}
          id="btn-menu-usuario"
          onClick={() => setAberto((a) => !a)}
          title={`${usuario.nome} (${usuario.login})`}
          aria-haspopup="menu"
          aria-expanded={aberto}
        >
          <span className="menu-usuario-rotulo">{usuario.nome}</span>
          <span className="menu-usuario-avatar">
            {iniciais(usuario.nome)}
            {usuario.senha_inicial && <span className="menu-usuario-alerta" aria-hidden="true" />}
          </span>
        </button>
        {aberto && (
          <div className="menu-usuario-painel" role="menu">
            <div className="menu-usuario-quem">
              <div className="menu-usuario-nome">{usuario.nome}</div>
              <div className="menu-usuario-login">@{usuario.login}</div>
            </div>
            <button
              role="menuitem"
              className="menu-usuario-item"
              id="btn-meus-dados"
              onClick={() => {
                setAberto(false);
                setEditando(true);
              }}
            >
              Meus dados
            </button>
            <button role="menuitem" className="menu-usuario-item sair" id="btn-sair" onClick={() => void sair()}>
              Sair
            </button>
          </div>
        )}
      </div>

      <FormularioUsuario
        modo={editando ? { tipo: 'meus-dados', usuario } : null}
        fechar={() => setEditando(false)}
        salvo={(msg, u) => {
          setEditando(false);
          setAviso(msg);
          void atualizar(u as typeof usuario);
        }}
      />
    </header>
  );
}
