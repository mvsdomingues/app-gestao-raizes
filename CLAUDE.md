# Convenções do projeto

- Monorepo npm: `apps/server` (Express + SQLite), `apps/web` (React + Vite), `packages/shared` (tipos e regras compartilhadas). Tudo em TypeScript; textos, nomes e comentários em português.
- **Menu:** toda nova funcionalidade com tela própria entra na **barra lateral** (`apps/web/src/components/BarraLateral.tsx`), no grupo adequado (Vendas, Cadastros, Sistema), salvo instrução explícita em contrário. A tela vai em `apps/web/src/features/<nome>/`, é registrada em `app/App.tsx` (mapa `TELAS`).
- **Acesso:** toda tela nova também entra em `TELAS_SISTEMA` (`packages/shared/src/acesso.ts`), que define a permissão; rotas novas da API precisam de regra em `REGRAS` (`apps/server/src/lib/sessao.ts`), senão exigem apenas login. Botões que levam a outra tela usam `pode('<tela>')` (`useSessao`). Usuários nunca são apagados (ficam ativos ou inativos). Ações gravadas (orçamentos, pedidos, movimentações) guardam o `usuario_id` de quem as fez; não há segregação de dados entre usuários.
- **Visual:** reutilizar as classes e tokens existentes (`--uva`, `--berinjela`, `--creme`; Cormorant Garamond + Jost). CSS por tela em `apps/web/src/styles/NN-nome.css`, importado em ordem em `styles/index.css`.
- **Banco:** alterações de esquema em `apps/server/src/db/esquema.ts` (sempre `CREATE … IF NOT EXISTS`, sem perder dados do `data/produtos.db`).
- **Credenciais** só no `.env` (nunca no código). `data/` e `.env` ficam fora do Git.
- Antes de entregar: `npm run typecheck`, `npm test` e `npm run build`.
