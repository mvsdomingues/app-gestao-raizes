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
│           ├── features/       ← catalogo, carrinho, orcamento, mockup, historico, produtos-proprios, parametros, atualizacao
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

A SPOT não publica URLs de imagem. O comando abaixo abre o site com um navegador automatizado e baixa as fotos para `data/imagens/spot/`:

```bash
npm run setup:playwright          # uma única vez (instala o Chromium)
npm run imagens:spot              # produtos sem imagem
npm run imagens:spot -- --limit 50
npm run imagens:spot -- --force   # reprocessa todos
```

> Atenção: atualizar a SPOT recria os produtos e apaga o vínculo com as imagens baixadas (comportamento herdado da versão anterior).

---

## 🪟 Windows

| Arquivo | Uso |
|---|---|
| `scripts/windows/iniciar.cmd` | Inicia a aplicação (instala e gera o build na primeira vez) |
| `scripts/windows/iniciar-oculto.vbs` | Mesmo que o anterior, sem janela. Para iniciar com o Windows: `Win+R` → `shell:startup` → crie um atalho para este arquivo |
| `scripts/windows/atualizar-produtos.cmd` | Para o Agendador de Tarefas (diariamente). Grava o log em `logs/atualizacao.log` |

---

## 💡 Uso da interface

O menu fica na **barra lateral** (pode ser recolhido para mostrar só os ícones). Toda nova tela deve ser adicionada a esse menu, em `apps/web/src/components/BarraLateral.tsx`.

**Vendas**

1. **Catálogo**: busque por nome ou código, filtre por fornecedor/estoque, alterne grade/lista e clique no produto para incluí-lo no carrinho. Mostra os produtos dos fornecedores e os produtos próprios.
2. **Carrinho**: ajuste quantidades e, em *Ajustar custos e margem*, os valores da calculadora de cada item. Todo item entra no carrinho com os valores da tela **Parâmetros**.
3. **Orçamento**: *Gerar Orçamento* salva no histórico (numeração `ORC-0001`…) e abre a folha para **Imprimir / Salvar PDF**.
4. **Mockups**: aplique a logomarca sobre a foto dos produtos do carrinho e baixe o PNG.
5. **Histórico**: reabra qualquer orçamento salvo.

**Cadastros**

6. **Produtos Próprios**: inclua, busque, altere e exclua produtos da própria empresa. Cada um recebe um código sequencial `PDP-000001`, `PDP-000002`… (códigos excluídos não são reutilizados). A foto pode ser enviada do computador ou informada por URL; os arquivos ficam em `data/imagens/proprios/`.
7. **Parâmetros**: valores iniciais da calculadora (material, mão de obra, imposto de compra, designer, logística, imposto sobre venda e margem), com simulação de preço. Itens que já estão no carrinho mantêm os valores com que foram adicionados.

**Sistema**

8. **Atualização**: atualiza a base dos fornecedores integrados e mostra o log.

### Calculadora de preço

```
Custo total/un = custo × (1 + imposto de compra*) + material + mão de obra + (designer + logística) ÷ qtd
Preço          = Custo total ÷ (1 − imposto sobre venda − margem)
```

Valores de fábrica (usados até a primeira gravação em **Parâmetros**): material R$ 1,00 · mão de obra R$ 3,00 · designer R$ 60 · logística R$ 60 · imposto de compra 14% (ativo) · imposto sobre venda 6% · margem 35%.

### API

| Rota | Uso |
|---|---|
| `GET /api/produtos` · `GET /api/produto/:id` | Catálogo (fornecedores + próprios; próprios têm id negativo) |
| `GET/POST /api/produtos-proprios` | Lista (`?q=` busca) / inclui produto próprio |
| `GET/PUT/PATCH/DELETE /api/produtos-proprios/:codigo` | Consulta, substitui, altera campos ou exclui (`PDP-000001`) |
| `GET/PUT /api/parametros` | Lê / grava os parâmetros da calculadora |
| `GET/POST /api/orcamentos` · `GET /api/orcamentos/:id` | Histórico de orçamentos |
| `POST /api/atualizar` · `GET /api/atualizar/status` | Atualização dos fornecedores |
