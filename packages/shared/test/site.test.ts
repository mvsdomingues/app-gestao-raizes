import { describe, expect, it } from 'vitest';
import {
  chaveDoModelo,
  lerPalavrasChave,
  nomeDoModelo,
  removerCodigos,
  slugCategoria,
  sugerirCategoria,
  visibilidadeNoSite,
} from '../src/site';

const CATS = [
  { id: 1, nome: 'Escrita', palavras_chave: ['caneta', 'lapis'] },
  { id: 2, nome: 'Garrafas e Copos', palavras_chave: ['garrafa', 'copo', 'squeeze', 'caneca'] },
  { id: 3, nome: 'Casa e Cozinha', palavras_chave: ['porta copos', 'pote'] },
  { id: 4, nome: 'Kits', palavras_chave: ['kit'] },
  { id: 5, nome: 'Churrasco', palavras_chave: ['kit churrasco'] },
];

describe('site: modelo do produto', () => {
  it('agrupa as cores pelo código sem o sufixo (ASIA, SPOT) e mantém SM, XBZ e próprios', () => {
    expect(chaveDoModelo('ASIA', 'MC511-CZ')).toBe('MC511');
    expect(chaveDoModelo('ASIA', 'CJ325P')).toBe('CJ325P');
    expect(chaveDoModelo('SPOT', '11103-103')).toBe('11103');
    expect(chaveDoModelo('XBZ', '06520')).toBe('06520');
    expect(chaveDoModelo('SM', 'AS-00610')).toBe('AS-00610');
    expect(chaveDoModelo('PRÓPRIO', 'PDP-000001')).toBe('PDP-000001');
  });

  it('tira a cor do fim do nome e os códigos do fornecedor', () => {
    expect(nomeDoModelo('Bolsa Multifuncional - Cinza', ['Cinza', 'Preto'])).toBe('Bolsa Multifuncional');
    expect(nomeDoModelo('CANECA ACRÍLICA 400 ML AZUL', ['AZUL'])).toBe('CANECA ACRÍLICA 400 ML');
    expect(nomeDoModelo('Azul Marinho Caneta', ['Azul'])).toBe('Azul Marinho Caneta');
    expect(nomeDoModelo('11103. Borracha branca', [], ['11103', '11103-103'])).toBe('Borracha branca');
    expect(removerCodigos('Caneta MC511-CZ em metal', ['MC511-CZ', 'MC511'])).toBe('Caneta em metal');
  });
});

describe('site: categorias', () => {
  it('sugere pela palavra-chave mais longa, inteira ou no plural', () => {
    expect(sugerirCategoria('Escrita › Esferográficas em Metal', CATS)).toBe(1);
    expect(sugerirCategoria('Canetas', CATS)).toBe(1);
    expect(sugerirCategoria('Copos, Canecas, Squeezes e Garrafas', CATS)).toBe(2);
    expect(sugerirCategoria('Porta copos de cortiça', CATS)).toBe(3);
    expect(sugerirCategoria('Kit churrasco 3 peças', CATS)).toBe(5);
    expect(sugerirCategoria('Kit escritório', CATS)).toBe(4);
    // "pote" não combina com "potência"
    expect(sugerirCategoria('Caixa de som de alta potência', CATS)).toBeNull();
    expect(sugerirCategoria('Lançamentos', CATS)).toBeNull();
  });

  it('normaliza slugs e palavras-chave', () => {
    expect(slugCategoria('Garrafas e Copos')).toBe('garrafas-e-copos');
    expect(slugCategoria('Bem-estar & Beleza')).toBe('bem-estar-beleza');
    expect(lerPalavrasChave('Caneta, LÁPIS; marca-texto\ncaneta, a')).toEqual(['caneta', 'lapis', 'marca texto']);
  });
});

describe('site: visibilidade', () => {
  it('automático exige foto e disponibilidade; oculto e sempre valem acima disso', () => {
    expect(visibilidadeNoSite({ modo: 'auto', fotos: 2, disponivel: true, saiu: false })).toEqual({ visivel: true, motivo: null });
    expect(visibilidadeNoSite({ modo: 'auto', fotos: 0, disponivel: true, saiu: false }).motivo).toBe('Sem foto');
    expect(visibilidadeNoSite({ modo: 'auto', fotos: 1, disponivel: false, saiu: false }).motivo).toBe('Indisponível');
    expect(visibilidadeNoSite({ modo: 'oculto', fotos: 1, disponivel: true, saiu: false }).visivel).toBe(false);
    expect(visibilidadeNoSite({ modo: 'sempre', fotos: 0, disponivel: false, saiu: false }).visivel).toBe(true);
    expect(visibilidadeNoSite({ modo: 'sempre', fotos: 1, disponivel: true, saiu: true }).visivel).toBe(false);
  });
});
