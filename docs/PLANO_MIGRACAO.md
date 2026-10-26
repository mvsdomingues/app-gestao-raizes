# Plano de Migração — Python/Flask → Node.js + React

**Projeto:** app-gestao-raizes (Raízes Personalizados · Catálogo & Orçamento)
**Data:** 26/10/2026
**Status:** executado em 26/10/2026.

> **Decisões aplicadas:** TypeScript em todo o projeto; comportamento da aplicação mantido (paridade estrita);
> credenciais movidas para o `.env`; migração no mesmo repositório, com remoção dos arquivos Python.
> A estrutura final ficou em `apps/server`, `apps/web` e `packages/shared` (veja o README), e os dados locais
> foram movidos para `data/` (`data/produtos.db` e `data/imagens/spot/`).

---

## 1. Análise do sistema atual

### 1.1 Inventário

| Arquivo | Linhas | Papel |
|---|---|---|
| `app.py` | 4.391 | Servidor Flask (~280 linhas) + **todo o front-end embutido numa string `HTML`** (~1.990 linhas de CSS, ~440 de HTML, ~1.660 de JavaScript puro) |
| `atualizar_produtos.py` | 449 | Coletor dos 4 fornecedores → SQLite (CLI, também disparado pela UI) |
| `baixar_imagens_spot.py` | 333 | Scraper Playwright das imagens da SPOT (CLI avulso, não é chamado pela UI) |
| `instalar_playwright_windows.py` | 45 | Instalador do Playwright/Chromium no Windows |
| `produtos.db` | 4,3 MB | SQLite: 18.330 produtos, 46 atualizações, 4 orçamentos |
| `static/imagens/spot/` | 6 arquivos | Imagens SPOT baixadas localmente |

Ponto importante: **a migração é muito mais de front-end do que de back-end.** O Python do servidor é pequeno; ~93% do `app.py` já é HTML/CSS/JS, que hoje roda no navegador. Isso facilita a migração da lógica (já está em JavaScript), mas exige converter ~1.660 linhas de JS imperativo (manipulação direta de DOM via `innerHTML`) para componentes React.

### 1.2 Banco de dados (SQLite)

```
produtos     (id, fornecedor, codigo, nome, preco, qtd_estoque, atualizado, imagem_url)
atualizacoes (id, fornecedor, status, total, data_hora)          -- log por fornecedor
orcamentos   (id, data_hora, subtotal, frete, total, qtd_itens, itens_json)
```

- `produtos` é **apagado e reinserido por fornecedor** a cada atualização (os IDs mudam a cada carga).
- `orcamentos.itens_json` guarda um *snapshot* dos itens (nome, código, fornecedor, imagem, qty, preço calculado, texto de composição) — o orçamento não depende mais da tabela `produtos` depois de salvo.
- Formatos de data atuais (precisam ser mantidos idênticos):
  - `atualizacoes.data_hora` / `produtos.atualizado`: `2026-10-24 18:04:38` (hora local, com espaço)
  - `orcamentos.data_hora`: `2026-10-24T18:13:29` (ISO **local, sem fuso**)

### 1.3 Back-end — API Flask (11 rotas + estáticos)

| Rota | Método | Função |
|---|---|---|
| `/` | GET | Entrega a página única (SPA) |
| `/api/fornecedores` | GET | `DISTINCT fornecedor` dos produtos |
| `/api/status` | GET | Última atualização de cada fornecedor |
| `/api/produtos` | GET | Busca paginada: `q` (LIKE em nome/código), `fornecedor`, `estoque=1`, `limit` (80), `offset`; retorna `{total, produtos}` ordenado por fornecedor, nome |
| `/api/produto/<id>` | GET | Um produto (404 `{"erro": ...}` se não existe) |
| `/api/proxy-img?url=` | GET | Proxy de imagens externas (evita "canvas contaminado" por CORS no mockup); cache 24h |
| `/api/orcamentos` | GET | Lista do histórico com `numero` = `ORC-0001` |
| `/api/orcamentos` | POST | Salva orçamento (valida itens não vazios e números) → `{id, numero, data_hora}` |
| `/api/orcamentos/<id>` | GET | Detalhe com `itens` desserializados |
| `/api/atualizar` | POST | Dispara `atualizar_produtos.py` em subprocesso (filtra fornecedores válidos; 409 se já roda) |
| `/api/atualizar/status` | GET | Estado do processo + log (últimas 2.000 linhas) |
| `/static/*` | GET | Arquivos estáticos (imagens SPOT) |

`UpdateManager`: singleton em memória que roda o coletor como processo filho, lê stdout linha a linha numa thread e expõe status. Força UTF-8 no Windows.

### 1.4 Front-end — 6 telas (abas) + 2 modais

| Aba | O que faz |
|---|---|
| **Catálogo** | Busca com debounce 300 ms; filtro por fornecedor e "somente com estoque"; modo grade/lista; agrupamento por fornecedor; paginação de 80 com janela ±2 páginas; selo de estoque (>10 ok / >0 baixo / sem estoque); clique no card adiciona/remove do carrinho; clique na foto abre lightbox |
| **Carrinho** | Itens com qty (+/−/digitação sem perder foco), **calculadora de preço por item** (painel "Ajustar custos e margem"), faixa de volume, aviso para qty < 10, frete, subtotal/total, "Limpar tudo" (com confirmação), editar avulso, atalho "🎨 Mockup" por item |
| **Orçamento** | Folha timbrada para impressão (`window.print()` / salvar PDF): número, data, totais por fornecedor, tabela com composição de preço, rodapé "Válido por 7 dias" |
| **🎨 Mockups** | Estúdio 100% no navegador (Canvas 2D 700×700): escolher produto do carrinho (ou demo), upload/arrastar logo ou usar logo demo SVG, modo de mesclagem (multiply/normal/overlay/screen), tingimento (original/branco/preto/dourado com gradiente), opacidade, escala (10–120%, também pela roda do mouse), rotação (−180°…180°, +90°), arrastar com mouse/toque, centralizar X/Y, reset, baixar PNG, "Salvar no orçamento" |
| **Histórico** | Tabela de orçamentos salvos; clique reabre a folha |
| **Atualização** | Checkbox dos 4 fornecedores, marcar/desmarcar todos, disparo, barra de progresso, log ao vivo (polling 1,2 s com auto-scroll), cards de status; ao abrir a página retoma o acompanhamento se já houver atualização rodando |

Elementos globais: barra de status no rodapé (última atualização por fornecedor), badge com contagem do carrinho, lightbox de imagem, modal de **produto avulso** (descrição, fornecedor com sugestões, custo, código, foto opcional até 5 MB como data URL; IDs negativos).

### 1.5 Regra de negócio central — calculadora de preço

```
custoProdutoComImposto = custo × (1 + imposto_compra)   [se imposto_compra_ativo]
custoFixoRateado       = (designer_total + logistica_total) ÷ qty
custoTotal             = custoProdutoComImposto + mat_personalizacao + mo_personalizacao + custoFixoRateado
preco                  = custoTotal ÷ (1 − imposto − margem)          (0 se divisor ≤ 0)
margemReal             = 1 − custoTotal/preco − imposto
```

Padrões: material R$ 1,00 · MO R$ 3,00 · designer R$ 60 · logística R$ 60 · imposto venda 6% · margem 35% · imposto compra 14% (ativo). 8 faixas de volume (1–9 … 1000–9999). O texto de `composicao` gravado no orçamento é montado a partir desses valores — **deve sair byte a byte igual** para manter o histórico consistente.

### 1.6 Coletores de fornecedores

| Fornecedor | Origem | Particularidades a preservar |
|---|---|---|
| ASIA | POST form-urlencoded paginado (100/pág., pausa 0,5 s) | Explode **variações** em linhas; nome `"<nome> - <cor>"`; imagem da variação tem prioridade sobre a do pai; `primeira_url()` recursiva (str/lista/dict) |
| SM | GET com header `Authorization` | Resposta pode ser lista ou dict; **mapeamento de colunas exato + heurístico** por substring |
| SPOT | 2 CSVs separados por `;` (produtos + estoque) | Merge por `Sku` (left join); imagem sempre `None` |
| XBZ | GET JSON | Nome = `Nome + " " + CorWebPrincipal`; detecção de coluna de imagem por lista de candidatos + heurística; só aceita URLs `http` |

Erros de um fornecedor não interrompem os demais (registrados como `ERRO: <msg>` em `atualizacoes`). O log impresso no stdout é o que a UI mostra.

---

## 2. Achados importantes (decidir antes de migrar)

"Mesmas funcionalidades" inclui, por padrão, os comportamentos abaixo — alguns são bugs. Recomendo **migrar com paridade total primeiro** e corrigir depois, numa etapa separada, para que a comparação antigo × novo seja limpa. Marque o que prefere:

| # | Achado | Impacto | Proposta |
|---|---|---|---|
| A1 | **Credenciais em texto puro** no `atualizar_produtos.py` (chaves ASIA, auth SM, AccessKey SPOT, token/CNPJ XBZ) | Segurança — hoje só não estão no GitHub porque o código ainda não foi commitado | Mover para `.env` (não versionado) já na migração ✅ recomendado |
| A2 | `.gitignore` atual é um template Node e **não ignora** `produtos.db`, `__pycache__`, `static/imagens` | Risco de subir o banco para o GitHub | Corrigir na migração ✅ |
| A3 | "Salvar no Orçamento" do mockup grava `mockup_img` no item do carrinho, mas **esse campo não entra no snapshot nem na folha impressa** — na prática não tem efeito visível | Funcionalidade incompleta | Manter igual (paridade) ou implementar exibição na folha (melhoria) |
| A4 | Ao terminar uma atualização, `loadSuppliers()` **duplica as opções** do filtro de fornecedor | Bug visual | Corrigir (custo zero em React) |
| A5 | O **carrinho vive só na memória** — recarregar a página perde tudo | Comportamento atual | Manter (paridade) ou persistir em `localStorage` |
| A6 | `atualizar_produtos.py spot` **apaga as imagens** gravadas pelo `baixar_imagens_spot.py` (delete + insert). Hoje há 0 produtos SPOT com imagem no banco, apesar de existirem arquivos em `static/imagens/spot/` (os 6 têm o mesmo tamanho, 7.958 bytes — provavelmente o mesmo placeholder) | As imagens SPOT nunca aparecem | Manter (paridade) ou religar a imagem local por código após cada carga |
| A7 | `/api/proxy-img` aceita **qualquer URL** (proxy aberto) | Baixo risco (uso local), mas é SSRF | Manter; opcionalmente restringir a domínios dos fornecedores |
| A8 | Projeto e `produtos.db` dentro do **OneDrive** | Sincronização pode corromper SQLite em uso | Recomendo mover a pasta para fora do OneDrive (ex.: `C:\dev\`) |

---

## 3. Arquitetura alvo

### 3.1 Stack proposta

| Camada | Escolha | Motivo |
|---|---|---|
| Runtime | **Node.js 22 LTS** | Suporte longo, `fetch` nativo, roda bem no Windows |
| Linguagem | **TypeScript** (front e back) | Contratos de API tipados e compartilhados; evita erros na portabilidade da calculadora. *Alternativa: JavaScript puro, se preferir menos cerimônia* |
| Servidor | **Express 5** | Mapeamento 1:1 com as rotas Flask, simples |
| SQLite | **better-sqlite3** | Síncrono como o `sqlite3` do Python; usa **o mesmo `produtos.db` sem migração de dados** |
| Front-end | **React 18 + Vite** | Build rápido, dev server com proxy para a API |
| Estado | `useReducer` + Context (carrinho, mockup) | Sem dependência extra; estado é pequeno |
| CSS | **CSS atual reaproveitado** (mesmas classes, dividido por tela) | Garante visual idêntico. Sem Tailwind/biblioteca de UI nesta fase |
| CSV | `csv-parse` | Substitui `pandas.read_csv(sep=";")` |
| Scraper SPOT | **Playwright para Node** | Mesma biblioteca, API quase idêntica |
| Execução | `tsx` para scripts; build único servido pelo Express na **porta 5000** | Mantém o endereço `http://localhost:5000` e o autostart do Windows |
| Testes | Vitest (unidade) + Playwright Test (E2E/visual) | |

### 3.2 Estrutura de pastas

```
app-gestao-raizes/
├── package.json                 ← workspaces + scripts raiz (dev, build, start, atualizar, imagens:spot)
├── .env.example                 ← chaves dos fornecedores (sem valores)
├── produtos.db                  ← mesmo arquivo de hoje (fora do git)
├── static/imagens/spot/         ← mantido no mesmo caminho (URLs /static/... já gravadas no banco)
├── shared/
│   ├── types.ts                 ← Produto, Orcamento, ItemSnapshot, StatusAtualizacao…
│   └── calculadora.ts           ← calcPreco, FAIXAS, getFaixa, CALC_DEFAULTS, construirComposicao
├── server/
│   ├── src/index.ts             ← Express, static, fallback para o SPA
│   ├── src/db.ts                ← conexão, query(), init das tabelas
│   ├── src/routes/produtos.ts   ← /api/fornecedores, /api/status, /api/produtos, /api/produto/:id
│   ├── src/routes/orcamentos.ts
│   ├── src/routes/atualizar.ts  ← + UpdateManager (child_process.spawn)
│   ├── src/routes/proxyImg.ts
│   └── src/util/datas.ts        ← formatos de data local idênticos ao Python
├── scripts/
│   ├── atualizar-produtos.ts    ← CLI: `npm run atualizar -- asia spot`
│   ├── fornecedores/{asia,sm,spot,xbz}.ts
│   ├── baixar-imagens-spot.ts   ← CLI: --force, --limit
│   └── util/primeiraUrl.ts
└── web/
    ├── index.html               ← fontes Google (Cormorant Garamond + Jost)
    └── src/
        ├── main.tsx, App.tsx    ← abas (sem roteador: mesmo comportamento de troca de view)
        ├── api.ts               ← cliente tipado da API
        ├── state/CartContext.tsx
        ├── styles/              ← tokens.css + CSS atual dividido por tela
        ├── components/          ← Header/Tabs, StatusBar, Lightbox, ModalProdutoAvulso, Spinner, SupBadge
        └── views/
            ├── Catalogo/        ← SearchBar, ProductGrid, ProductList, Pagination
            ├── Carrinho/        ← CartItem, CalcPanel, ResumoCarrinho
            ├── Orcamento/       ← FolhaOrcamento (print)
            ├── Mockups/         ← MockupStudio, useMockupCanvas, renderMockup.ts (funções puras de canvas)
            ├── Historico/
            └── Atualizacao/     ← UpdatePanel, StatusCards, useUpdatePolling
```

Observação: o React em produção é compilado (`web/dist`) e servido pelo próprio Express — **um único processo, uma única porta**, como hoje.

---

## 4. Mapeamento Python/JS atual → Node/React

### 4.1 Back-end

| Atual | Novo | Cuidados de paridade |
|---|---|---|
| `query()` com `sqlite3.Row` | `db.prepare(sql).all(params)` | Mesmas consultas SQL, mesmos nomes de coluna |
| `jsonify(...)` | `res.json(...)` | Mesmo formato de erro `{"erro": "..."}` e mesmos status (400/404/409/500) |
| `f"ORC-{id:04d}"` | `` `ORC-${String(id).padStart(4,'0')}` `` | |
| `datetime.now().isoformat(timespec="seconds")` | `formatarIsoLocal(new Date())` | **Não usar `toISOString()`** (UTC + `Z`) — quebraria a exibição de horário |
| `json.dumps(itens, ensure_ascii=False)` | `JSON.stringify(itens)` | Compatível na leitura dos 4 orçamentos já existentes |
| `request.args` com `int(...)` | `Number.parseInt` + validação | Python retorna 500 com `limit` inválido; manter tolerância equivalente |
| `requests.get` no proxy | `fetch` com `AbortSignal.timeout(12000)` + `User-Agent` | Mesmos headers de resposta (`Access-Control-Allow-Origin`, `Cache-Control`) |
| `UpdateManager` (subprocess + thread) | Classe com `child_process.spawn('node', [...])`, leitura com `readline` | Buffer de 2.000 linhas; `running`, `return_code`, `iniciado_em`, `finalizado_em`; lock natural (event loop) |
| `init_orcamentos_db()` | `CREATE TABLE IF NOT EXISTS` na subida | Também criar `produtos`/`atualizacoes` se não existirem |

### 4.2 Coletores

| Atual (pandas/requests) | Novo |
|---|---|
| `requests.post(data=payload)` | `fetch` com `URLSearchParams` |
| `pd.read_csv(sep=";")` + `pd.merge(how="left")` | `csv-parse` + `Map` por `Sku` |
| `df.rename` + heurística SM | Função pura `mapearColunasSM(colunas)` com a mesma ordem de prioridade (exato → heurístico) |
| Conversões `float(x or 0)`, `str(x or "")` | Helpers `toFloat`/`toStr` reproduzindo `NaN`→0, `None`→`""` |
| Inserção linha a linha | Mesma lógica, mas dentro de **transação** (`db.transaction`) — mesmo resultado, muito mais rápido |
| `print(...)` | `console.log(...)` com **as mesmas mensagens** (o log aparece na UI) |
| `sys.exit(1)` em fornecedor inválido | `process.exit(1)` |

### 4.3 Front-end

| Atual (JS imperativo) | Novo (React) |
|---|---|
| `setView()` com `display` | Estado `view` em `App`; troca de aba dispara os mesmos carregamentos (status, histórico, mockup) |
| `cart` global (objeto) | `CartContext` com reducer: `toggle`, `setQty`, `remove`, `clear`, `addCustom`, `editCustom`, `updateCalc`, `setMockupImg` |
| `innerHTML` + `escHtml/escAttr` | JSX (escapamento automático) |
| `setQtyLight` (evitar perder foco) | Input controlado — o problema deixa de existir; manter o comportamento de normalizar no `blur` |
| `onerror` trocando a imagem por `✦` | Componente `<ProdutoImg>` com estado de erro |
| `confirm()` / `alert()` | Manter nativos na Fase 1 (paridade) |
| Polling com `setInterval` | Hook `useUpdatePolling` com limpeza no unmount; verifica atualização ativa ao montar o app |
| Canvas do mockup | `useRef<HTMLCanvasElement>` + funções puras (`renderMockup`, `getTintedLogoCanvas`, `desenharSilhueta`) copiadas quase literalmente; listeners de mouse/toque/roda via `useEffect` |
| `window.print()` + `@media print` | Idem; CSS de impressão preservado |

---

## 5. Fases de execução

Cada fase termina com algo testável. Estimativas consideram trabalho comigo executando e você validando.

### Fase 0 — Preparação (≈ 0,5 dia)
1. Commitar o estado atual do Python no git (pelo tamanho do histórico local, o código ainda não parece estar versionado) e criar tag `v-python-final`.
2. Corrigir `.gitignore` (A2) e mover credenciais para `.env` (A1) — ainda no Python, para servir de referência.
3. Criar branch `migracao-node`.
4. **Gerar a "linha de base" de paridade:** script que chama todas as rotas da API Flask com um conjunto de parâmetros (buscas, filtros, páginas, IDs, histórico) sobre uma cópia do banco e salva as respostas JSON; screenshots de cada aba com Playwright; tabela de casos da calculadora (qty 1, 9, 10, 50, 1000; imposto de compra on/off; margem extrema).

**Critério de aceite:** baseline salva em `tests/baseline/`.

### Fase 1 — Esqueleto e camada de dados (≈ 0,5 dia)
1. Monorepo com workspaces (`shared`, `server`, `web`), TypeScript, ESLint, scripts `dev`/`build`/`start`.
2. `db.ts` apontando para o mesmo `produtos.db`.
3. `shared/calculadora.ts` portada + testes unitários comparando com a tabela da baseline.

**Aceite:** testes da calculadora 100% iguais (tolerância 1e-9) e texto de `composicao` idêntico.

### Fase 2 — API Node (≈ 1 dia)
1. Todas as rotas da seção 1.3, servindo `/static`.
2. `UpdateManager` em Node (inicialmente pode chamar o **script Python** para isolar a migração dos coletores).
3. Teste de contrato: mesmas requisições da baseline contra o Node → diff JSON.

**Aceite:** diff zero em todas as rotas (exceto campos de data gerados no momento).

### Fase 3 — Coletores em Node (≈ 1,5 dia)
1. Portar `primeira_url`, ASIA, SM, SPOT, XBZ e o `main` com os mesmos argumentos de CLI.
2. Teste de paridade: rodar Python e Node em **cópias separadas** do banco, no mesmo momento, e comparar `produtos` por fornecedor (contagem, códigos, nomes, preços, estoque, imagem).
3. Trocar o `UpdateManager` para o script Node.

**Aceite:** diferenças só onde o fornecedor mudou dados entre as duas execuções; log com as mesmas mensagens.

### Fase 4 — Front-end React, telas simples (≈ 2 dias)
1. Base: `App`, abas, header, barra de status, tokens e CSS migrados, lightbox.
2. **Catálogo** (busca, filtros, grade/lista, paginação, toggle do carrinho).
3. **Histórico** e **Atualização** (painel, polling, log, cards).

**Aceite:** comparação visual com a baseline (diferença de pixels abaixo do limite combinado) e checklist funcional da seção 6.

### Fase 5 — Carrinho e Orçamento (≈ 1,5 dia)
1. Carrinho com calculadora por item, faixas, aviso < 10, frete, totais, limpar.
2. Modal de produto avulso (criar/editar, foto até 5 MB, IDs negativos).
3. Geração e gravação do orçamento, folha de impressão, reabertura pelo histórico.

**Aceite:** orçamento gerado no Node para o mesmo carrinho tem `itens_json`, subtotal, total e folha impressa iguais aos do Python; os 4 orçamentos antigos abrem corretamente.

### Fase 6 — Estúdio de Mockups (≈ 1,5 dia)
1. Portar o canvas e todos os controles (seção 1.4).
2. Proxy de imagem para evitar canvas contaminado; fallback de URL direta; data URL de produtos avulsos.
3. Baixar PNG e "Salvar no orçamento".

**Aceite:** com o mesmo produto, logo e parâmetros, o PNG exportado é idêntico (ou diferença de pixel desprezível) ao do Python.

### Fase 7 — Scraper SPOT e utilitários (≈ 0,5 dia)
1. `baixar-imagens-spot.ts` com Playwright Node (`--force`, `--limit`, concorrência 3, mesmos seletores e filtros).
2. Substituir `instalar_playwright_windows.py` por `npm run setup:playwright` (`npx playwright install chromium`).

### Fase 8 — Corte e implantação (≈ 0,5 dia)
1. `npm run build && npm start` → `http://localhost:5000`.
2. Atualizar o **autostart do Windows 11** para iniciar o Node (script `.cmd`/`.vbs` ou serviço via `pm2`/NSSM).
3. Atualizar o agendamento diário (Agendador de Tarefas) para `npm run atualizar`.
4. Reescrever o README.
5. Rodar o sistema novo em paralelo por alguns dias; depois remover os `.py`.

**Total estimado: ≈ 9–10 dias de trabalho**, com validação sua ao fim de cada fase.

### Fase 9 (opcional, depois da paridade) — Correções e melhorias
A3 (mostrar mockup na folha), A4, A5 (persistir carrinho), A6 (preservar imagens SPOT), A7 (restringir proxy), substituir `alert/confirm` por modais próprios.

---

## 6. Checklist de paridade funcional

**Catálogo**
- [ ] Busca por nome e código, debounce 300 ms
- [ ] Filtro de fornecedor (lista vinda do banco) e "somente com estoque"
- [ ] Contador "N produtos encontrados" com plural e separador pt-BR
- [ ] Grade e lista, agrupadas por fornecedor com badge e contagem
- [ ] Selos de estoque (>10, 1–10, 0)
- [ ] Paginação de 80, janela ±2, reticências, primeira/última
- [ ] Clique no card / botão + adiciona e remove; card marca "no carrinho"
- [ ] Clique na imagem abre lightbox; imagem quebrada mostra ✦

**Carrinho**
- [ ] Badge da aba com contagem
- [ ] +/−, digitação e mínimo 1
- [ ] Calculadora: todos os 8 campos, checkbox de imposto de compra, percentuais exibidos ×100
- [ ] Faixa de volume, custo total/un, margem real, aviso qty < 10
- [ ] Frete, subtotal, total geral, botão Gerar desabilitado sem itens
- [ ] Limpar tudo com confirmação
- [ ] Produto avulso: criar, editar, foto (validação de tipo e 5 MB, arrastar/soltar), fornecedor em maiúsculas até 20 caracteres, padrão `AVULSO`

**Orçamento / Histórico**
- [ ] POST salva e retorna `ORC-NNNN`; em falha, exibe o orçamento com número "—" e alerta
- [ ] Folha: data/hora pt-BR, totais por fornecedor, frete, composição de preço, rodapé
- [ ] Impressão / Salvar PDF com o mesmo layout
- [ ] Histórico ordenado do mais recente; clique reabre

**Mockups**
- [ ] Lista de produtos do carrinho; demo quando vazio; seleção ativa
- [ ] Logo: upload, arrastar, demo, remover, nome e dimensões
- [ ] Mesclagem, tingimento, opacidade, escala (slider e roda), rotação (slider e +90°)
- [ ] Arrastar com mouse e toque (limites 4%–96%), guia tracejada com alças
- [ ] Centralizar X/Y, reset, silhueta sem foto
- [ ] Baixar PNG `mockup-<codigo>.png`, salvar no item do carrinho

**Atualização**
- [ ] Seleção de fornecedores, marcar/desmarcar todos, validação de ao menos um
- [ ] 409 quando já está rodando
- [ ] Log ao vivo com auto-scroll só quando no fim
- [ ] Estado final ✓/✗ com código de saída; recarrega status e fornecedores
- [ ] Retoma acompanhamento ao recarregar a página
- [ ] CLI `npm run atualizar -- asia spot` com as mesmas mensagens e tratamento de erro por fornecedor

---

## 7. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Diferenças sutis de arredondamento/conversão nos coletores (pandas trata `NaN`, tipos mistos) | Testes de paridade por fornecedor sobre cópias do banco (Fase 3) |
| Datas em UTC em vez de hora local | Utilitário único `datas.ts` + teste específico |
| Re-render do React quebrando foco/fluxo de digitação no carrinho | Inputs controlados; teste E2E de digitação |
| Performance do canvas com re-render React | Canvas desenhado fora do ciclo de render (refs + `requestAnimationFrame`) |
| `better-sqlite3` exige binário nativo no Windows | Usar versão com binários pré-compilados para Node 22; fallback: `node:sqlite` nativo |
| Banco aberto pelos dois sistemas durante a validação | Testes sempre sobre cópias; só o corte final usa o banco real |
| SQLite dentro do OneDrive | Ver A8 |

---

## 8. Decisões para você validar

1. **TypeScript ou JavaScript puro?** (recomendo TypeScript)
2. **Paridade estrita primeiro e correções depois (Fase 9)?** Ou já incluir alguma correção da seção 2 durante a migração? (recomendo paridade estrita, exceto A1, A2 e A4)
3. **Mover credenciais para `.env`** já na Fase 0? (recomendo sim)
4. **Manter a estrutura em pasta única** (este repositório) ou criar um repositório novo?
5. **Como o app deve subir no Windows** depois da migração: script simples no autostart (como hoje) ou serviço com `pm2`?
6. **Mover o projeto para fora do OneDrive** aproveitando a migração?
