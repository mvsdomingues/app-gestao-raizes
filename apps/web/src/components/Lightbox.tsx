import { useApp } from '../app/contexto';

/** Visualização ampliada de uma foto de produto (clique em qualquer lugar fecha). */
export function Lightbox() {
  const { imagemAmpliada, fecharImagem } = useApp();
  return (
    <div id="img-modal" className={imagemAmpliada ? 'open' : undefined} onClick={fecharImagem}>
      <img id="img-modal-img" src={imagemAmpliada ?? undefined} alt="" />
    </div>
  );
}
