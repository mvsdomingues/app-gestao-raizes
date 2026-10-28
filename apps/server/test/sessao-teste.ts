/** Faz login (admin/admin por padrão) e devolve o cabeçalho Cookie da sessão. */
export async function entrar(base: string, login = 'admin', senha = 'admin'): Promise<string> {
  const r = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, senha }),
  });
  if (r.status !== 200) throw new Error(`login falhou (${r.status})`);
  const c = r.headers.get('set-cookie') ?? '';
  return c.split(';')[0]!;
}
