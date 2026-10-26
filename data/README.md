# data/

Dados locais da aplicação — **não versionados** (veja `.gitignore`).

| Caminho | Conteúdo |
|---|---|
| `produtos.db` | Banco SQLite: produtos dos fornecedores, histórico de atualizações e orçamentos |
| `imagens/spot/` | Imagens da SPOT baixadas por `npm run imagens:spot` (servidas em `/static/imagens/spot/…`) |

Os caminhos podem ser alterados no `.env` (`DB_PATH` e `IMAGENS_DIR`).
Faça backup do `produtos.db` regularmente: é nele que fica o histórico de orçamentos.
