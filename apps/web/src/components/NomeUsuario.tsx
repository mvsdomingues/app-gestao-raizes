import type { UsuarioResumo } from '@raizes/shared';

/** Nome do usuário responsável (login no tooltip); "—" nos registros anteriores ao controle de acesso. */
export function NomeUsuario({ usuario, className = '' }: { usuario: UsuarioResumo | null | undefined; className?: string }) {
  if (!usuario) {
    return (
      <span className={`nome-usuario vazio ${className}`} title="Registro anterior ao controle de acesso">
        —
      </span>
    );
  }
  return (
    <span className={`nome-usuario ${className}`} title={`@${usuario.login}`}>
      {usuario.nome}
    </span>
  );
}
