import { formatarTelefone, urlContatoKommo, type ClienteVinculado as Cliente } from '@raizes/shared';
import { useConfigClientes } from './config';

/** "Nome · telefone" do cliente vinculado, com link para o contato no Kommo. */
export function ClienteVinculado({
  cliente,
  link = true,
  vazio = '—',
}: {
  cliente: Cliente | null | undefined;
  link?: boolean;
  vazio?: string;
}) {
  const { subdominio } = useConfigClientes();
  if (!cliente) return <span className="cliente-vazio">{vazio}</span>;
  return (
    <span className="cliente-vinculado">
      <span className="cliente-nome">{cliente.nome || `Contato #${cliente.id}`}</span>
      {cliente.telefone && <span className="cliente-tel"> · {formatarTelefone(cliente.telefone)}</span>}
      {link && subdominio && (
        <a
          className="cliente-link-kommo"
          href={urlContatoKommo(subdominio, cliente.id)}
          target="_blank"
          rel="noreferrer"
          title="Abrir o contato no Kommo"
          onClick={(e) => e.stopPropagation()}
        >
          Abrir no Kommo ↗
        </a>
      )}
    </span>
  );
}
