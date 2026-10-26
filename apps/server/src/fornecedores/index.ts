import type { ChaveFornecedor } from '@raizes/shared';
import { asia } from './asia';
import { sm } from './sm';
import { spot } from './spot';
import type { Coletor } from './tipos';
import { xbz } from './xbz';

/** Mapa de fornecedores (chave usada na linha de comando → coletor). */
export const COLETORES: Record<ChaveFornecedor, Coletor> = { asia, sm, spot, xbz };

export type { Coletor, ContextoColeta, LinhaFornecedor } from './tipos';
