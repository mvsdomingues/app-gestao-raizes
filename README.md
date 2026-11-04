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

### Detalhes dos produtos

Além de código, nome, preço, estoque e foto, cada atualização grava os **detalhes** que o fornecedor informa (textos limpos: sem `&amp;`, marcações HTML ou espaços repetidos):

| Campo | ASIA | SM | SPOT | XBZ |
|---|---|---|---|---|
| Nome | `nome` + cor da variação | `titulo` | `Name` sem o código do começo (`11104. …`) | `Nome` + cor |
| Descrição | `descricao` do produto pai | `descricao` | `Description` | `Descricao` |
| Medidas / peso / capacidade | propriedades do produto | `dimensoes_do_produto` | `CombinedSizes`, `WeightGr`, `Capacity` | `Peso`; medidas só quando informadas |
| Material / cor | — / cor da variação | — | `Materials` / `ColorDesc1` | — / `CorWebPrincipal` |
| Categoria (como vem) | `categorias` | `matriz_de_categorias` | `Type › SubType` | `WebTipo › WebSubTipo` |
| Personalização | — | `tipo_gravacao` | `DefaultCustomization` | — |
| Fotos / vídeo | `imagem` + `galeria` / `video` | `url_foto` + `matriz_de_fotos_adicionais` | `AllImageList` / `VideoLink` | `ImageLink` |
| Ficha técnica | demais propriedades (caixa, embalagem, NCM…) | embalagem, garantia, qtd. mínima, NCM | tipos de gravação, características, marca, origem, caixa, NCM | cor secundária, NCM |

A SM também informa o **preço por quantidade** (`grade_preco_*`): fica gravado (`faixas_preco`) e aparece só no painel interno do produto. Depois de instalar esta versão, rode a atualização de produtos uma vez para preencher os detalhes.

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

1. **Catálogo**: busque por nome, código ou descrição (cada palavra digitada precisa aparecer), filtre por fornecedor/**categoria**/**cor**/estoque (a cor junta as grafias de cada fornecedor: "AZUL" e "Azul" são a mesma), ordene por **menor ou maior preço** (ou nome) e filtre por **faixa de preço** (faixas prontas de até R$ 5 a acima de R$ 200, ou mínimo e máximo digitados; produtos sem preço ficam fora das faixas e no fim da ordenação por preço). Ordenado por preço ou nome, a lista deixa de ser agrupada por fornecedor. Alterne grade/lista e clique no produto para incluí-lo no carrinho. Mostra os produtos dos fornecedores e os produtos próprios. Cada cartão traz a categoria e a cor; o botão **i** abre os **detalhes do produto**: galeria de fotos, descrição, ficha técnica (material, medidas, peso, capacidade, personalização…), vídeo e, na SM, o custo por quantidade (tela interna; clique numa categoria ou na cor para filtrar). O resumo da descrição (até ~200 caracteres), as medidas e o material vão para o item do orçamento e aparecem na folha e na página do cliente — o fornecedor, a marca e o tipo de gravação nunca. No **Mockups**, quando o produto tem mais de uma foto, escolha a foto usada na faixa *Fotos do produto*.
2. **Carrinho**: cada item mostra o nome e o código do produto. Ajuste quantidades e, em *Ajustar custos e margem*, os custos de personalização e os custos fixos de cada item (começam com os valores da tela **Parâmetros**). Imposto de compra, imposto sobre venda e margem não aparecem no carrinho: são sempre os cadastrados em **Parâmetros**. Há uma **observação geral** (campo *Observações* no resumo) e uma **observação por produto** (campo abaixo da quantidade de cada item). As duas são gravadas com o orçamento, aparecem na folha impressa e voltam ao carrinho quando o orçamento é alterado.
3. **Orçamentos**: tela única com duas abas.
   - **Todos os orçamentos**: lista paginada (20 por página) com filtros por número (`ORC-0005` ou `5`), produto (descrição ou código de qualquer item), período (de/até), faixa de valor total e situação. Clique em uma linha para ver os detalhes; **✎ Editar** carrega o orçamento de volta no carrinho (o carrinho precisa estar vazio).
   - **Detalhes**: folha do orçamento selecionado, com **Editar**, **Gerar pedido** e **Imprimir / Salvar PDF**.
   - **Situação** de cada orçamento: **Aberto** (ao ser gerado) → **Enviado** (botão *✉ Enviar para o Cliente* na lista ou nos detalhes; com o Kommo ligado, exige cliente vinculado; dá para voltar para Aberto) → **Pedido gerado** (automático ao gerar o pedido, com o código `PED-…` clicável). Se o pedido for cancelado, o orçamento volta para a situação que tinha (Aberto ou Enviado).
   - Cada mudança de situação fica no histórico (data, hora e usuário), visível nos detalhes junto com as etapas.
   - Só orçamento **Aberto** pode ser alterado. Se estiver **Enviado**, o sistema avisa que ele precisa voltar para Aberto antes (botão *↩ Voltar para aberto* nos detalhes); com **pedido gerado**, nunca. O botão **📦 Gerar pedido** vale para Aberto e Enviado.

   - **Previsão de entrega**: campo de data no resumo do carrinho, gravado com o orçamento. Aparece na folha (impressa e na página do cliente) e passa para o pedido.
   - **Cliente** (com a integração do Kommo ligada): veja *Clientes do Kommo* abaixo.
   - **Cancelado**: *✕ Cancelar orçamento* (Aberto ou Enviado, sempre com motivo) ou recusa do cliente pelo link. Cancelado não é alterado nem vira pedido; *↺ Reabrir* volta para Aberto. Orçamento com pedido ativo não é cancelado (cancela-se o pedido).
   - **Link para o cliente**: veja *Link do orçamento* abaixo.

   *Gerar Orçamento* no carrinho grava o orçamento (numeração `ORC-0001`…), esvazia o carrinho e abre a aba **Detalhes**. Ao salvar uma alteração, o orçamento mantém o mesmo número e recebe a data da alteração; não há limite de alterações.
4. **Pedidos**: tela com duas abas, no mesmo modelo de Orçamentos.
   - Todo pedido nasce de um orçamento (**+ Novo pedido** ou **Gerar pedido** na tela Orçamentos) e recebe o código `PED-000001`, `PED-000002`…; o pedido guarda a referência ao orçamento, que descreve o que será entregue.
   - Fluxo: **Criado → Em Fechamento → Em Produção → Produzido → Faturado → Enviado → Encerrado**. O botão de ação (na lista ou nos detalhes) move o pedido para a etapa seguinte, e cada movimentação grava a data e a hora (base para controle de SLA).
   - **Todos os pedidos**: lista paginada com tag da etapa e filtros por código, orçamento, situação (incluindo *Em andamento*) e período.
   - **Quadro**: kanban com uma coluna por etapa, nas mesmas cores das tags. Cada coluna mostra até 20 pedidos pela data/hora em que entraram na etapa (os que estão há mais tempo primeiro; em *Encerrado*, os mais recentes) e o total da etapa. O cartão pode ser arrastado, ou movido pelos botões ‹ ›, **apenas para a etapa anterior ou a próxima**; voltar uma etapa também fica registrado nas movimentações. Pedidos cancelados não aparecem no quadro.
   - **Entrega prevista**: vem do orçamento e aparece nos detalhes, na lista, no cartão do Quadro e na folha do pedido. Pode ser alterada (ou informada) só com o pedido na etapa **Criado**; cada mudança grava uma observação no histórico ("Data prevista de entrega alterada de … para …").
   - **Checklist de fechamento**: ao entrar em **Em Fechamento**, o pedido recebe a lista cadastrada em *Parâmetros › Checklist de fechamento*; nos detalhes, cada item é marcado com caixa de seleção (grava data, hora e usuário). Só pode ser alterado nessa etapa (nas outras, fica visível só para consulta) e não trava o fluxo: o pedido avança com itens em aberto. Mudanças no cadastro valem para os próximos pedidos. O cartão do Quadro mostra o progresso (ex.: ☑ 2/3).
   - **Calendário** (só consulta): pedidos com situação diferente de Encerrado, distribuídos pela **data prevista de entrega**, em visão de **semana** ou **mês** (botões ‹ Hoje ›, escolha do mês/ano ou de um dia da semana; a visão escolhida fica guardada no navegador). Cada dia mostra cartões reduzidos com código, cliente e etapa (no mês, até 3 por dia e "+ N pedidos"); entregas vencidas aparecem como *atrasado*. Pedidos sem data ficam numa lista abaixo do calendário. Clicar no cartão abre os detalhes; nada é movimentado nessa aba. Em telas estreitas vira uma agenda com os dias que têm pedidos.
   - **Observações** do pedido: histórico em linha do tempo (a mais recente no topo), com data, hora e autor de cada registro. Novas observações são **incluídas** a qualquer momento, em qualquer situação (inclusive encerrado ou cancelado), sem alterar o fluxo; as já registradas não são editadas nem apagadas. A observação dada ao gerar o pedido (ou pelo cliente, ao aceitar pelo link) é o primeiro registro.
   - **Detalhes**: etapas com data/hora, tempo total, histórico de movimentações com o tempo em cada etapa e os itens do orçamento.
   - Pedidos não são editados: se estiver errado, **Cancelar pedido** (com motivo). O orçamento fica livre para ser alterado ou usado em outro pedido. Nunca há dois pedidos ativos (não cancelados) para o mesmo orçamento; pedidos encerrados não podem ser cancelados.
5. **Mockups**: aplique a logomarca sobre a foto dos produtos do carrinho e baixe o PNG.

**Cadastros**

6. **Produtos Próprios**: inclua, busque, altere e exclua produtos da própria empresa. Cada um recebe um código sequencial `PDP-000001`, `PDP-000002`… (códigos excluídos não são reutilizados). A foto pode ser enviada do computador ou informada por URL; os arquivos ficam em `data/imagens/proprios/`. Em *Detalhes do produto* (opcional) informe descrição, material, medidas, peso, capacidade, cor, categoria, personalização e vídeo (YouTube/Vimeo) — aparecem no painel de detalhes do catálogo e, resumidos, no orçamento.
7. **Parâmetros**: tela em abas.
   - **Precificação**: valores da calculadora (material, mão de obra, imposto de compra, designer, logística, imposto sobre venda e margem), com simulação de preço. Material, mão de obra, designer e logística são o ponto de partida de cada item novo; imposto de compra, imposto sobre venda e margem valem sempre para todos os itens do carrinho.
   - **Checklist de fechamento**: itens da lista usada na etapa Em Fechamento dos pedidos (incluir, renomear, reordenar, remover).
   - **Sistema**: configurações gerais. **Enviar notas para o Kommo** (ativo por padrão): desligado, nenhuma nota é criada nem enviada ao Kommo (envio do orçamento, aceite, recusa e pedido gerado); as que já aguardavam reenvio ficam na fila até ser ligado de novo.

**Sistema**

8. **Atualização**: atualiza a base dos fornecedores integrados e mostra o log; com o Kommo ligado, mostra também a sincronização dos clientes.

### Link do orçamento (aceite pelo cliente)

*Enviar para o Cliente* gera um link secreto do orçamento (`/o/<código>`, 43 caracteres aleatórios; não há número nem sequência no endereço). A janela que abre mostra o link, **Copiar link** e **Enviar pelo WhatsApp** (telefone do cliente e mensagem prontos); os detalhes do orçamento mostram o link, a validade, se o cliente já abriu, e **Gerar novo link** (o anterior para de funcionar).

- **Página do cliente** (sem login, funciona no celular): mesmo conteúdo da folha impressa, **sem a composição do preço e sem fornecedor**, com *Imprimir / Salvar PDF* e, no fim, **Aceitar orçamento** (observação opcional) e **Rejeitar** (motivo obrigatório).
- **Aceitar** gera o pedido na hora (responsável = responsável pelo orçamento; a movimentação aparece como *Cliente (link)*). **Rejeitar** leva o orçamento a **Cancelado** com o motivo. O cliente responde uma vez só; data, hora, IP e navegador ficam gravados. Com o Kommo ligado, aceite e recusa viram notas no contato (a nota de envio leva o link).
- **Validade**: 7 dias a partir do envio. Vencido, a página continua visível, sem os botões. Orçamento que voltou para Aberto aparece como "em revisão"; ao reenviar, a validade recomeça.
- **Proteções**: código inválido, revogado ou de orçamento não enviado recebe a mesma resposta ("link inválido"); 20 códigos inválidos seguidos bloqueiam o IP por 15 minutos; páginas fora dos buscadores (`noindex`) e sem `Referer`; fotos servidas pelo sistema (o endereço do fornecedor não aparece).
- **Endereço do link**: `APP_URL_PUBLICA` no `.env`; sem ela, o endereço pelo qual a tela foi aberta (IP, domínio ou localhost). No Nginx não use senha (`auth_basic`), senão o cliente não abre o link: ver `deploy/nginx/raizes.conf`.
- **Composição do preço** (custo, impostos, margem): não aparece nos detalhes do orçamento nem do pedido, na folha impressa ou na página do cliente; fica só na calculadora do carrinho. O **fornecedor** aparece só na tela interna (fora da impressão e da página do cliente).

### Clientes do Kommo

Com `KOMMO_SUBDOMINIO` e `KOMMO_TOKEN` no `.env`, o orçamento passa a ter **cliente**, escolhido entre os contatos do Kommo (o sistema não cria contatos no Kommo).

- **Cópia local dos contatos**: o servidor lê todos os contatos na primeira vez e, depois, a cada `KOMMO_SYNC_MINUTOS` (padrão 10) só os alterados. Uma vez por dia, depois das 3h, faz a conferência completa e tira da busca os contatos apagados no Kommo. Na tela **Atualização**, o cartão *Clientes do Kommo* mostra o total, a última sincronização e os botões *Sincronizar clientes agora* e *Conferência completa*. O token fica só no servidor.
- **Carrinho**: campo **Cliente** no resumo, com uma caixa de busca única. O sistema reconhece o que foi digitado: telefone (qualquer formato, com ou sem +55), parte do nome (sem acento; todas as palavras), e-mail ou `#código` do Kommo. A lista mostra nome, telefones, código, data de criação, quantos orçamentos o cliente já tem e o aviso *telefone repetido* quando dois contatos têm o mesmo número. Se não achar (contato criado há poucos minutos), **Buscar direto no Kommo** consulta o Kommo na hora. Setas e Enter escolhem; o cliente escolhido mostra *Abrir no Kommo*, *Trocar* e *Remover*.
- O cliente é **opcional para gerar** o orçamento e **obrigatório para enviar** (*Enviar para o Cliente*). O orçamento guarda o código do contato e uma cópia do nome e do telefone.
- O cliente aparece nas listas e nos detalhes de Orçamentos e Pedidos, na folha impressa e no cartão do Quadro; as listas têm filtro por cliente e os detalhes, o link *Abrir no Kommo*.
- **Notas no contato do Kommo** (podem ser desligadas em *Parâmetros › Sistema*): ao clicar em *Enviar para o Cliente* ("Orçamento ORC-… enviado ao cliente", com valor, quantidade de itens e usuário) e ao gerar o pedido (código do pedido, orçamento, valor e usuário). As notas ficam no histórico do **contato** (não no negócio). Se o Kommo estiver fora do ar, a nota fica na fila e é reenviada a cada sincronização.

Sem as variáveis no `.env`, nada disso aparece e os orçamentos funcionam como antes.

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
| `GET /api/produtos` · `GET /api/produto/:id` | Catálogo (fornecedores + próprios; próprios têm id negativo). Filtros: `q`, `fornecedor`, `categoria`, `cor`, `estoque`, `ordem`, `min`, `max`. O detalhe traz descrição, ficha, fotos, vídeo e faixas de preço |
| `GET /api/categorias` · `GET /api/cores` | Categorias / cores com a quantidade de produtos (`?fornecedor=`) |
| `GET/POST /api/produtos-proprios` | Lista (`?q=` busca) / inclui produto próprio |
| `GET/PUT/PATCH/DELETE /api/produtos-proprios/:codigo` | Consulta, substitui, altera campos ou exclui (`PDP-000001`) |
| `GET/PUT /api/parametros` | Lê / grava os parâmetros da calculadora |
| `GET/PUT /api/parametros/checklist` | Cadastro do checklist de fechamento (`{ itens: [{ id?, texto }] }`, na ordem) |
| `PUT /api/pedidos/:codigo/checklist/:item` | Marca/desmarca um item (`{ feito }`; só na etapa Em Fechamento) |
| `GET/PUT /api/parametros/sistema` | Parâmetros de sistema (`{ kommo_notas_ativo }`) |
| `GET /api/orcamentos` | Lista paginada (`numero`, `produto`, `de`, `ate`, `min`, `max`, `status`, `pedido=com\|sem`, `meus=1`, `cliente`, `limit`, `offset`) → `{ total, orcamentos }` (cada um com `pedido` ativo ou `null`) |
| `POST /api/orcamentos` · `GET/PUT /api/orcamentos/:id` | Grava, consulta (com `status`, `movimentos` e `cliente`) e altera (PUT mantém o número; 409 se não estiver Aberto). `entrega_prevista` (AAAA-MM-DD) grava a previsão de entrega; `cliente_kommo_id` vincula o cliente (400 se não estiver na base; ausente no PUT = mantém) |
| `POST /api/orcamentos/:id/status` | Situação manual `{ status: 'ABERTO' \| 'ENVIADO' \| 'CANCELADO', status_atual, motivo? }` (Cancelado exige motivo; Aberto a partir de Cancelado = reabrir) (409 com pedido gerado ou, com o Kommo ligado, ao enviar sem cliente) |
| `POST /api/orcamentos/:id/link` | Gera um novo link do cliente (o anterior deixa de funcionar) |
| `GET /api/publico/orcamentos/:codigo` | **Sem login** · orçamento para a página do cliente (sem custos nem fornecedor) |
| `GET /api/publico/orcamentos/:codigo/imagem/:n` | **Sem login** · foto do item n |
| `POST /api/publico/orcamentos/:codigo/aceitar` · `.../recusar` | **Sem login** · aceite `{ observacao? }` (gera o pedido) / recusa `{ motivo }` (Cancelado) |
| `GET /api/clientes?busca=` | Busca na cópia local dos contatos do Kommo (telefone, nome, e-mail ou `#código`) → `{ tipo, fonte, clientes }` |
| `GET /api/clientes/kommo?busca=` · `GET /api/clientes/:id` | Busca direta no Kommo (grava na cópia local) / um cliente |
| `GET /api/clientes/config` | `{ ativo, subdominio }` (integração ligada?) |
| `GET /api/clientes/sincronizacao` · `POST /api/clientes/sincronizar` | Situação da sincronização / sincroniza agora (`{ completa?: true }`; tela Atualização) |
| `GET /api/pedidos` | Lista paginada (`codigo`, `orcamento`, `status` ou `EM_ANDAMENTO`, `de`, `ate`, `meus=1`, `cliente`, `limit`, `offset`) → `{ total, pedidos }` |
| `POST /api/pedidos` | Cria pedido `{ orcamento_id, observacao? }` (409 se o orçamento já tem pedido ativo) |
| `GET /api/pedidos/:codigo` | Pedido com movimentações e orçamento (`PED-000001`) |
| `GET /api/pedidos/quadro` | Quadro por etapa (`limite`, padrão 20; `meus=1`) → `{ limite, colunas: [{ status, total, pedidos }] }` |
| `POST /api/pedidos/:codigo/avancar` · `POST /api/pedidos/:codigo/retroceder` | Próxima / etapa anterior (`{ status_atual }`, 409 se o pedido já mudou) |
| `POST /api/pedidos/:codigo/cancelar` | Cancela (`{ motivo }`) |
| `GET /api/pedidos/calendario` | Pedidos não encerrados por data prevista de entrega (`de`, `ate` em AAAA-MM-DD, até 62 dias; `meus=1`) → `{ de, ate, pedidos, sem_data }` |
| `PUT /api/pedidos/:codigo/entrega` | Data prevista de entrega (`{ entrega_prevista: 'AAAA-MM-DD' \| null }`; só na etapa Criado, registra observação) |
| `POST /api/pedidos/:codigo/observacoes` | Inclui uma observação no histórico (`{ texto }`), em qualquer situação |
| `POST /api/atualizar` · `GET /api/atualizar/status` | Atualização dos fornecedores |
