import logoEscura from '../assets/logo-raizes.svg';
import logoClara from '../assets/logo-raizes-claro.svg';
import simboloClaro from '../assets/logo-raizes-r-claro.svg';

/**
 * Logomarca da Raízes Personalizados (vetor do arquivo oficial).
 * `clara` = para fundo escuro (barra lateral); `simbolo` = só o "R" (menu recolhido).
 */
export function Logo({
  clara = false,
  simbolo = false,
  className = '',
}: {
  clara?: boolean;
  simbolo?: boolean;
  className?: string;
}) {
  const src = simbolo ? simboloClaro : clara ? logoClara : logoEscura;
  return (
    <img
      src={src}
      alt="Raízes Personalizados"
      className={`logo-img${simbolo ? ' simbolo' : ''} ${className}`.trim()}
      draggable={false}
    />
  );
}
