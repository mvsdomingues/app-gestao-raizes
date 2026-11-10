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

/** Cliente do cadastro para os testes (orçamento só é enviado com cliente vinculado). */
export function clienteDeTeste(
  db: import('../src/db/conexao').Banco,
  dados: { nome?: string; telefone?: string; email?: string; kommo_id?: number } = {},
): number {
  const agora = new Date().toISOString().slice(0, 19);
  const nome = dados.nome ?? 'Cliente de Teste';
  const id = Number(
    db
      .prepare(
        `INSERT INTO clientes (tipo_pessoa, nome, nome_chave, telefone, telefone_chave, email, kommo_id, criado, atualizado)
         VALUES ('PJ', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(nome, nome.toLowerCase(), dados.telefone ?? '', '', dados.email ?? '', dados.kommo_id ?? null, agora, agora).lastInsertRowid,
  );
  return id;
}
