import type { OrigemMovimento, UsuarioResumo } from '@raizes/shared';

/**
 * Nome do usuário responsável (login no tooltip); "Cliente (link)" quando a ação veio
 * da página do cliente; "—" nos registros anteriores ao controle de acesso.
 */
export function NomeUsuario({
  usuario,
  className = '',
  origem,
}: {
  usuario: UsuarioResumo | null | undefined;
  className?: string;
  origem?: OrigemMovimento;
}) {
  if (origem === 'CLIENTE') {
    return (
      <span className={`nome-usuario cliente ${className}`} title="Resposta do cliente pela página do orçamento">
        Cliente (link)
      </span>
    );
  }
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
