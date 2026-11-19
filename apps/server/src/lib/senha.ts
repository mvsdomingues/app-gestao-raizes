import { randomBytes, scrypt, scryptSync, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Hash de senha com scrypt (nativo do Node, sem dependências).
// Formato gravado: scrypt$N$r$p$<sal base64>$<hash base64>
const N = 16384;
const R = 8;
const P = 1;
const TAMANHO = 64;

function scryptAsync(senha: string, sal: Buffer, tamanho: number, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((ok, falha) => scrypt(senha, sal, tamanho, opcoes, (e, chave) => (e ? falha(e) : ok(chave))));
}

function montar(sal: Buffer, hash: Buffer): string {
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  return montar(sal, await scryptAsync(senha, sal, TAMANHO, { N, r: R, p: P }));
}

/** Versão síncrona (só para criar o usuário inicial ao abrir o banco). */
export function gerarHashSenhaSync(senha: string): string {
  const sal = randomBytes(16);
  return montar(sal, scryptSync(senha, sal, TAMANHO, { N, r: R, p: P }));
}

export async function verificarSenha(senha: string, gravado: string): Promise<boolean> {
  const partes = gravado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, salB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64!, 'base64');
  const calculado = await scryptAsync(senha, Buffer.from(salB64!, 'base64'), esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

/** Hash "de mentira" usado quando o login não existe (tempo de resposta igual). */
export const HASH_FALSO = gerarHashSenhaSync(randomBytes(12).toString('hex'));
