# Raízes Personalizados · Catálogo & Orçamento

Aplicação interna para consultar produtos de vários fornecedores, montar orçamentos com a calculadora de preço, criar mockups com a logomarca do cliente e manter a base de produtos atualizada.

**Stack:** Node.js 22 + TypeScript · Express 5 + SQLite (better-sqlite3) · React 19 + Vite

---

## 📁 Estrutura

```
.
├── apps/
│   ├── server/                 ← API, atualização de fornecedores e scraper SPOT
│   │   ├── src/
│   │   │   ├── index.ts        ← inicia o servidor (porta 5000)
│   │   │   ├── app.ts          ← rotas e arquivos estáticos
│   │   │   ├── config.ts       ← lê o .env e resolve caminhos
│   │   │   ├── routes/         ← catálogo, produtos próprios, parâmetros, orçamentos, atualização, proxy
│   │   │   ├── services/       ← gerenciador da atualização, extração de imagens SPOT
│   │   │   ├── fornecedores/   ← coletores ASIA, SM, SPOT, XBZ
│   │   │   ├── db/             ← conexão, esquema e repositórios
│   │   │   ├── lib/            ← datas, conversões, utilitários HTTP
│   │   │   └── cli/            ← comandos de linha (atualizar-produtos, baixar-imagens-spot)
│   │   └── test/               ← testes da API, dos coletores e do scraper
│   └── web/                    ← interface React
│       └── src/
│           ├── app/            ← App e contexto (navegação entre abas)
│           ├── features/       ← catalogo, carrinho, orcamentos, pedidos, mockup, produtos-proprios, parametros, atualizacao
│           ├── components/     ← barra lateral (menu), rodapé, lightbox, imagem de produto
│           ├── state/          ← estado do carrinho
│           ├── lib/            ← cliente da API
│           └── styles/         ← CSS da identidade visual
├── packages/
│   └── shared/                 ← tipos e regras compartilhadas (calculadora de preço)
├── data/                       ← produtos.db e imagens baixadas (fora do Git)
├── scripts/windows/            ← atalhos para iniciar e agendar no Windows
├── docs/                       ← documentação (plano de migração)
└── .env                        ← credenciais dos fornecedores (fora do Git)
```

---

## ⚙️ Instalação

Pré-requisito: **Node.js 22 LTS** ou superior (<https://nodejs.org>).

```bash
npm install
cp .env.example .env      # no Windows: copy .env.example .env
```

Preencha as credenciais dos fornecedores no `.env`. Em seguida:

```bash
npm run build             # gera a interface e o servidor
npm start                 # http://localhost:5000
```

> Depois de alterar o código ou atualizar a versão, rode `npm run build` de novo antes do `npm start`.

### Desenvolvimento

```bash
npm run dev               # API (5000) + interface com recarga automática em http://localhost:5173
npm test                  # testes (calculadora, API, coletores, scraper)
npm run typecheck         # checagem de tipos
```

---

## 🔄 Atualizar a base de produtos

Pela interface: aba **Atualização** → marque os fornecedores → **Atualizar agora** (o log aparece em tempo real).

Pela linha de comando:

```bash
npm run atualizar                 # todos os fornecedores
npm run atualizar -- asia spot    # apenas os informados
```

Fornecedores disponíveis: `asia`, `sm`, `spot`, `xbz`.

| Código | Fornecedor  | Método                   | Variáveis no `.env`              |
|--------|-------------|--------------------------|----------------------------------|
| ASIA   | Asia Import | REST API paginada        | `ASIA_API_KEY`, `ASIA_SECRET_KEY` |
| SM     | So Marcas   | REST API (GET com auth)  | `SM_AUTHORIZATION`               |
| SPOT   | Spot Gifts  | Download de CSV          | `SPOT_ACCESS_KEY`                |
| XBZ    | Minha XBZ   | REST API                 | `XBZ_CNPJ`, `XBZ_TOKEN`          |

### Imagens da SPOT

A SPOT envia no CSV só o nome do arquivo da foto. Na atualização, cada produto passa a apontar para a foto publicada no site: `https://www.spotgifts.com.br/fotos/produtos/11112_104-c_1.jpg` (montada pela coluna `Image` ou pelo Sku; códigos com tamanho, como `11112-104-GG`, usam a foto do produto base). Não é preciso navegador automatizado nem baixar arquivos; produto sem foto nesse endereço mostra o placeholder.

O comando antigo de download com Playwright continua disponível, mas só é necessário em casos pontuais:

```bash
npm run setup:playwright          # uma única vez (instala o Chromium)
npm run imagens:spot -- --force   # reprocessa todos
```

---

## 🪟 Windows

| Arquivo | Uso |
|---|---|
| `scripts/windows/iniciar.cmd` | Inicia a aplicação (instala e gera o build na primeira vez) |
| `scripts/windows/iniciar-oculto.vbs` | Mesmo que o anterior, sem janela. Para iniciar com o Windows: `Win+R` → `shell:startup` → crie um atalho para este arquivo |
| `scripts/windows/atualizar-produtos.cmd` | Para o Agendador de Tarefas (diariamente). Grava o log em `logs/atualizacao.log` |

---

## 💡 Uso da interface

### Acesso

O sistema exige login. Na primeira execução é criado o usuário **`admin`** com senha **`admin`**, com acesso a todas as telas. **Troque essa senha no primeiro acesso** (ícone do usuário no canto superior direito → *Meus dados*); até a troca, o sistema mostra um aviso.

- **Usuários** (menu Sistema): inclusão (nome, login e senha), alteração de nome/senha, inativação e reativação.
  - Login: só letras e números (3 a 30), sem diferenciar maiúsculas. É a chave do usuário: não pode ser alterado nem reaproveitado, mesmo com o usuário inativo.
  - Senha: mínimo de 6 caracteres, com letras e números. É guardada apenas como hash (scrypt); ninguém consegue vê-la.
  - Nenhum usuário é apagado: ele fica **ativo** ou **inativo**. O inativo não entra no sistema, mas continua no banco (e como responsável pelas ações que fez); ao ser reativado, volta com os mesmos acessos. Ninguém inativa o próprio usuário.
- **Acessos** (menu Sistema): escolha as telas que cada usuário pode usar. O menu mostra só as telas liberadas e o servidor bloqueia as funções das demais. Sempre fica pelo menos um usuário com acesso à tela Acessos. Telas novas do sistema são liberadas automaticamente a quem tem acesso à tela Acessos.
- **Meus dados**: cada usuário altera o próprio nome e a senha (pedindo a senha atual). Trocar a senha encerra as outras sessões abertas desse usuário.
- Cada orçamento e pedido guarda o usuário responsável (quem criou; no orçamento, também quem fez a última alteração) e cada movimentação de pedido guarda quem a fez. Essas informações aparecem nas listas e nos detalhes. Todos os usuários veem todos os dados; o filtro rápido **Somente os meus** (listas de Orçamentos e Pedidos e Quadro) mostra só os criados pelo usuário logado.
- A sessão expira após 12 horas sem uso. Após 5 senhas erradas seguidas, o login fica bloqueado por 5 minutos.

O menu fica na **barra lateral** (pode ser recolhido para mostrar só os ícones). Toda nova tela deve ser adicionada a esse menu, em `apps/web/src/components/BarraLateral.tsx`.

**Vendas**

1. **Catálogo**: busque por nome ou código, filtre por fornecedor/estoque, alterne grade/lista e clique no produto para incluí-lo no carrinho. Mostra os produtos dos fornecedores e os produtos próprios.
2. **Carrinho**: ajuste quantidades e, em *Ajustar custos e margem*, os custos de personalização e os custos fixos de cada item (começam com os valores da tela **Parâmetros**). Imposto de compra, imposto sobre venda e margem não aparecem no carrinho: são sempre os cadastrados em **Parâmetros**.
3. **Orçamentos**: tela única com duas abas.
   - **Todos os orçamentos**: lista paginada (20 por página) com filtros por número (`ORC-0005` ou `5`), produto (descrição ou código de qualquer item), período (de/até), faixa de valor total e pedido (com/sem). Clique em uma linha para ver os detalhes; **✎ Editar** carrega o orçamento de volta no carrinho (o carrinho precisa estar vazio).
   - **Detalhes**: folha do orçamento selecionado, com **Editar**, **Gerar pedido** e **Imprimir / Salvar PDF**.
   - Cada orçamento mostra uma tag: o código do pedido ativo (ex.: `PED-000001`, clique para abrir o pedido) ou **sem pedido**. Orçamento com pedido ativo **não pode ser editado**; sem pedido, mantém a edição normal e o botão **📦 Gerar pedido**.

   *Gerar Orçamento* no carrinho grava o orçamento (numeração `ORC-0001`…), esvazia o carrinho e abre a aba **Detalhes**. Ao salvar uma alteração, o orçamento mantém o mesmo número e recebe a data da alteração; não há limite de alterações.
4. **Pedidos**: tela com duas abas, no mesmo modelo de Orçamentos.
   - Todo pedido nasce de um orçamento (**+ Novo pedido** ou **Gerar pedido** na tela Orçamentos) e recebe o código `PED-000001`, `PED-000002`…; o pedido guarda a referência ao orçamento, que descreve o que será entregue.
   - Fluxo: **Criado → Em Produção → Produzido → Faturado → Enviado → Encerrado**. O botão de ação (na lista ou nos detalhes) move o pedido para a etapa seguinte, e cada movimentação grava a data e a hora (base para controle de SLA).
   - **Todos os pedidos**: lista paginada com tag da etapa e filtros por código, orçamento, situação (incluindo *Em andamento*) e período.
   - **Quadro**: kanban com uma coluna por etapa, nas mesmas cores das tags. Cada coluna mostra até 20 pedidos pela data/hora em que entraram na etapa (os que estão há mais tempo primeiro; em *Encerrado*, os mais recentes) e o total da etapa. O cartão pode ser arrastado, ou movido pelos botões ‹ ›, **apenas para a etapa anterior ou a próxima**; voltar uma etapa também fica registrado nas movimentações. Pedidos cancelados não aparecem no quadro.
   - **Detalhes**: etapas com data/hora, tempo total, histórico de movimentações com o tempo em cada etapa e os itens do orçamento.
   - Pedidos não são editados: se estiver errado, **Cancelar pedido** (com motivo). O orçamento fica livre para ser alterado ou usado em outro pedido. Nunca há dois pedidos ativos (não cancelados) para o mesmo orçamento; pedidos encerrados não podem ser cancelados.
5. **Mockups**: aplique a logomarca sobre a foto dos produtos do carrinho e baixe o PNG.

**Cadastros**

6. **Produtos Próprios**: inclua, busque, altere e exclua produtos da própria empresa. Cada um recebe um código sequencial `PDP-000001`, `PDP-000002`… (códigos excluídos não são reutilizados). A foto pode ser enviada do computador ou informada por URL; os arquivos ficam em `data/imagens/proprios/`.
7. **Parâmetros**: valores da calculadora (material, mão de obra, imposto de compra, designer, logística, imposto sobre venda e margem), com simulação de preço. Material, mão de obra, designer e logística são o ponto de partida de cada item novo; imposto de compra, imposto sobre venda e margem valem sempre para todos os itens do carrinho.

**Sistema**

8. **Atualização**: atualiza a base dos fornecedores integrados e mostra o log.

### Calculadora de preço

```
Custo total/un = custo × (1 + imposto de compra*) + material + mão de obra + (designer + logística) ÷ qtd
Preço          = Custo total ÷ (1 − imposto sobre venda − margem)
```

Valores de fábrica (usados até a primeira gravação em **Parâmetros**): material R$ 1,00 · mão de obra R$ 3,00 · designer R$ 60 · logística R$ 60 · imposto de compra 14% (ativo) · imposto sobre venda 6% · margem 35%.

### API

Todas as rotas exigem login, exceto as de `/api/auth`. Cada rota também exige acesso à tela correspondente (regras em `apps/server/src/lib/sessao.ts`).

| Rota | Uso |
|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/sessao` | Login (cookie de sessão HttpOnly), saída e usuário logado |
| `PUT /api/auth/meus-dados` | Nome e senha do próprio usuário (`senha_atual`, `senha_nova`) |
| `GET/POST /api/usuarios` · `PUT /api/usuarios/:id` | Usuários (`?inativos=1` inclui os inativos) |
| `POST /api/usuarios/:id/inativar` · `POST /api/usuarios/:id/reativar` | Inativa / reativa (nenhum usuário é apagado) |
| `GET /api/acessos` · `PUT /api/acessos/:id` | Telas liberadas por usuário (`{ permissoes: [...] }`) |
| `GET /api/produtos` · `GET /api/produto/:id` | Catálogo (fornecedores + próprios; próprios têm id negativo) |
| `GET/POST /api/produtos-proprios` | Lista (`?q=` busca) / inclui produto próprio |
| `GET/PUT/PATCH/DELETE /api/produtos-proprios/:codigo` | Consulta, substitui, altera campos ou exclui (`PDP-000001`) |
| `GET/PUT /api/parametros` | Lê / grava os parâmetros da calculadora |
| `GET /api/orcamentos` | Lista paginada (`numero`, `produto`, `de`, `ate`, `min`, `max`, `pedido=com\|sem`, `meus=1`, `limit`, `offset`) → `{ total, orcamentos }` (cada um com `pedido` ativo ou `null`) |
| `POST /api/orcamentos` · `GET/PUT /api/orcamentos/:id` | Grava, consulta e altera (PUT mantém o número; 409 se houver pedido ativo) |
| `GET /api/pedidos` | Lista paginada (`codigo`, `orcamento`, `status` ou `EM_ANDAMENTO`, `de`, `ate`, `meus=1`, `limit`, `offset`) → `{ total, pedidos }` |
| `POST /api/pedidos` | Cria pedido `{ orcamento_id, observacao? }` (409 se o orçamento já tem pedido ativo) |
| `GET /api/pedidos/:codigo` | Pedido com movimentações e orçamento (`PED-000001`) |
| `GET /api/pedidos/quadro` | Quadro por etapa (`limite`, padrão 20; `meus=1`) → `{ limite, colunas: [{ status, total, pedidos }] }` |
| `POST /api/pedidos/:codigo/avancar` · `POST /api/pedidos/:codigo/retroceder` | Próxima / etapa anterior (`{ status_atual }`, 409 se o pedido já mudou) |
| `POST /api/pedidos/:codigo/cancelar` | Cancela (`{ motivo }`) |
| `POST /api/atualizar` · `GET /api/atualizar/status` | Atualização dos fornecedores |
