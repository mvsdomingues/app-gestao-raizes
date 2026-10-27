/** Ícones de linha (traço na cor do texto) usados no menu lateral. */
const CAMINHOS = {
  catalogo: 'M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z',
  carrinho: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20.5h.01M17 20.5h.01',
  orcamento: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  mockup: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.7 1.6-1.5 0-1.2-1-1.5-1-2.6 0-.9.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  historico: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
  produtos: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  parametros: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
  atualizacao: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  recolher: 'M15 6l-6 6 6 6',
  expandir: 'M9 6l6 6-6 6',
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, tamanho = 18 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={CAMINHOS[nome]} />
    </svg>
  );
}
