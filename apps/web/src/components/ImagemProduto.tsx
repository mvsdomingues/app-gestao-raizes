import { useEffect, useState, type CSSProperties, type MouseEventHandler } from 'react';

interface Props {
  url: string | null | undefined;
  alt?: string;
  /** Classe do placeholder "✦" exibido sem imagem ou quando ela falha. */
  classeVazia: string;
  /** Usa <div> em vez de <span> no placeholder. */
  vaziaDiv?: boolean;
  /** Ícone do placeholder (padrão ✦). */
  icone?: string;
  className?: string;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
  onClick?: MouseEventHandler<HTMLImageElement>;
  title?: string;
}

/** Imagem de produto que vira placeholder quando não existe ou não carrega. */
export function ImagemProduto({ url, classeVazia, vaziaDiv, icone = '✦', ...img }: Props) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [url]);

  if (!url || falhou) {
    return vaziaDiv ? <div className={classeVazia}>{icone}</div> : <span className={classeVazia}>{icone}</span>;
  }
  // no-referrer: fornecedores com bloqueio de "hotlink" costumam liberar pedidos sem Referer
  return <img src={url} referrerPolicy="no-referrer" {...img} alt={img.alt ?? ''} onError={() => setFalhou(true)} />;
}
