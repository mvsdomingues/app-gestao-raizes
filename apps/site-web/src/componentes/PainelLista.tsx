import { useEffect } from 'react';
import { urlFotoProduto } from '@raizes/contrato-site';
import { useLista, type ItemLista } from '../lista';
import { Link, navegar } from '../rota';
import { Foto } from './Basicos';

/** Painel lateral com a lista de cotação (abre ao incluir um produto ou pelo botão do cabeçalho). */
export function PainelLista() {
  const { itens, aberta, fechar, alterar, remover } = useLista();
  useEffect(() => {
    if (!aberta) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aberta, fechar]);
  if (!aberta) return null;
  const abaixo = itens.filter((i) => i.quantidade < i.minimo);

  return (
    <div className="gaveta-fundo" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <aside className="painel-lista" aria-label="Lista de cotação">
        <div className="painel-topo">
          <h2>Sua lista de cotação</h2>
          <button type="button" className="fechar" aria-label="Fechar a lista" onClick={fechar}>
            ✕
          </button>
        </div>
        {itens.length === 0 ? (
          <div className="painel-vazio">
            <p>Sua lista está vazia. Escolha os produtos e as quantidades; no fim você envia tudo de uma vez e recebe a cotação.</p>
            <Link href="/produtos" className="botao" onClick={fechar}>
              Ver produtos
            </Link>
          </div>
        ) : (
          <>
            <ul className="painel-itens">
              {itens.map((i) => (
                <LinhaLista key={i.uid} i={i} alterar={(m) => alterar(i.uid, m)} remover={() => remover(i.uid)} fechar={fechar} />
              ))}
            </ul>
            <div className="painel-rodape">
              {abaixo.length > 0 && <p className="alerta-minimo">Há produto abaixo da quantidade mínima.</p>}
              <button
                type="button"
                className="botao botao-grande"
                disabled={abaixo.length > 0}
                onClick={() => {
                  fechar();
                  navegar('/cotacao');
                }}
              >
                Revisar e enviar ({itens.length} produto{itens.length !== 1 ? 's' : ''})
              </button>
              <button type="button" className="link-botao" onClick={fechar}>
                Continuar escolhendo
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function LinhaLista({
  i,
  alterar,
  remover,
  fechar,
}: {
  i: ItemLista;
  alterar: (m: Partial<ItemLista>) => void;
  remover: () => void;
  fechar: () => void;
}) {
  const baixa = i.quantidade < i.minimo;
  return (
    <li className="painel-item">
      <Link href={`/produtos/${i.slug}`} className="painel-foto" onClick={fechar}>
        <Foto src={i.fotos ? urlFotoProduto(i.codigo, i.foto, 'p') : null} alt="" />
      </Link>
      <div className="painel-info">
        <Link href={`/produtos/${i.slug}`} className="painel-nome" onClick={fechar}>
          {i.nome}
        </Link>
        <span className="painel-cor">{i.cor_nome ? `Cor: ${i.cor_nome}` : 'Cor a definir'}</span>
        <div className="painel-qtd">
          <input
            type="number"
            inputMode="numeric"
            min={i.minimo}
            aria-label={`Quantidade de ${i.nome}`}
            aria-invalid={baixa}
            value={i.quantidade || ''}
            onChange={(e) => alterar({ quantidade: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
          />
          <span className={baixa ? 'alerta-minimo' : ''}>un. (mín. {i.minimo.toLocaleString('pt-BR')})</span>
        </div>
      </div>
      <button type="button" className="remover" aria-label={`Tirar ${i.nome} da lista`} onClick={remover}>
        ✕
      </button>
    </li>
  );
}
