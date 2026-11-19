import { describe, expect, it } from 'vitest';
import { categoriasDe, montarItemOrcamento, CALC_DEFAULTS, resumoDescricao, urlVideoIncorporado } from '../src';

describe('detalhes do produto', () => {
  it('resume a descrição em até 200 caracteres, no fim de uma palavra', () => {
    expect(resumoDescricao('  Caneca\n\nde cerâmica  ')).toBe('Caneca de cerâmica');
    const longa = 'palavra '.repeat(40).trim();
    const r = resumoDescricao(longa);
    expect(r.length).toBeLessThanOrEqual(201);
    expect(r.endsWith('palavra…')).toBe(true);
    expect(resumoDescricao(null)).toBe('');
  });

  it('separa as categorias', () => {
    expect(categoriasDe('Copos, Canecas|Lançamentos| ')).toEqual(['Copos, Canecas', 'Lançamentos']);
    expect(categoriasDe(null)).toEqual([]);
  });

  it('reconhece vídeos do YouTube e do Vimeo', () => {
    expect(urlVideoIncorporado('https://youtube.com/embed/rrdCplVHHJU')).toBe('https://www.youtube.com/embed/rrdCplVHHJU');
    expect(urlVideoIncorporado('https://www.youtube.com/watch?v=CMwB3iYoV08&t=3')).toBe('https://www.youtube.com/embed/CMwB3iYoV08');
    expect(urlVideoIncorporado('https://youtu.be/abcdef123')).toBe('https://www.youtube.com/embed/abcdef123');
    expect(urlVideoIncorporado('https://vimeo.com/123456')).toBe('https://player.vimeo.com/video/123456');
    expect(urlVideoIncorporado('https://exemplo.com/v.mp4')).toBeNull();
  });

  it('o item do orçamento guarda o resumo do produto', () => {
    const base = { id: 1, nome: 'Caneca', codigo: 'C1', fornecedor: 'XBZ', imagem_url: null, preco: 10 };
    const item = montarItemOrcamento(
      { ...base, descricao: 'x '.repeat(200), medidas: ' 9 x 8 cm ', material: 'Cerâmica' },
      10,
      CALC_DEFAULTS,
    );
    expect(item.descricao!.length).toBeLessThanOrEqual(201);
    expect(item.medidas).toBe('9 x 8 cm');
    expect(item.material).toBe('Cerâmica');
    const semDetalhes = montarItemOrcamento(base, 10, CALC_DEFAULTS);
    expect('descricao' in semDetalhes).toBe(false);
  });
});
