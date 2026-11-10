import { codigoCliente, formatarTelefone, type ClienteVinculado as Cliente } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';

/** "Nome · telefone" do cliente vinculado, com link para a ficha na tela Clientes (quem tem acesso). */
export function ClienteVinculado({
  cliente,
  link = true,
  vazio = '—',
}: {
  cliente: Cliente | null | undefined;
  link?: boolean;
  vazio?: string;
}) {
  const { abrirCliente } = useApp();
  const { pode } = useSessao();
  if (!cliente) return <span className="cliente-vazio">{vazio}</span>;
  return (
    <span className="cliente-vinculado">
      <span className="cliente-nome">{cliente.nome || cliente.codigo || codigoCliente(cliente.id)}</span>
      {cliente.telefone && <span className="cliente-tel"> · {formatarTelefone(cliente.telefone)}</span>}
      {!cliente.telefone && cliente.email && <span className="cliente-tel"> · {cliente.email}</span>}
      {link && pode('clientes') && (
        <button
          type="button"
          className="link-botao cliente-ver-cadastro"
          title={`Abrir ${cliente.codigo ?? codigoCliente(cliente.id)} na tela Clientes`}
          onClick={(e) => {
            e.stopPropagation();
            abrirCliente(cliente.id);
          }}
        >
          Ver cadastro
        </button>
      )}
    </span>
  );
}
