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

A SPOT envia no CSV só o nome do arquivo da foto. Na atualização, cada produto passa a apontar para a foto publicada no site, com o nome exato do arquivo do CSV: `https://www.spotgifts.com.br/fotos/produtos/11112_104.jpg` (pela coluna da foto ou, sem ela, pelo Sku; a variante `-c_1` só existe para algumas fotos e não é usada; códigos com tamanho, como `11112-104-GG`, usam a foto do produto base). Não é preciso navegador automatizado nem baixar arquivos; produto sem foto nesse endereço mostra o placeholder.

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

1. **Catálogo**: busque por nome, código ou descrição (cada palavra digitada precisa aparecer), filtre por fornecedor/**categoria**/**cor**/estoque (a cor junta as grafias de cada fornecedor: "AZUL" e "Azul" são a mesma), ordene por **menor ou maior preço** (ou nome) e filtre por **faixa de preço** (faixas prontas de até R$ 5 a acima de R$ 200, ou mínimo e máximo digitados; produtos sem preço ficam fora das faixas e no fim da ordenação por preço). Ordenado por preço ou nome, a lista deixa de ser agrupada por fornecedor. Alterne grade/lista e clique no produto para incluí-lo no carrinho. Mostra os produtos dos fornecedores e os produtos próprios. Cada cartão traz a categoria e a cor; o botão **i** abre os **detalhes do produto**: galeria de fotos, descrição, ficha técnica (material, medidas, peso, capacidade, personalização…), vídeo e, na SM, o custo por quantidade (tela interna; clique numa categoria ou na cor para filtrar). O resumo da descrição (até ~200 caracteres), as medidas e o material vão para o item do orçamento e aparecem na folha e na página do cliente — o fornecedor, a marca e o tipo de gravação nunca.
2. **Carrinho**: cada item mostra o nome e o código do produto. Ajuste quantidades e, em *Ajustar custos e margem*, os custos de personalização e os custos fixos de cada item (começam com os valores da tela **Parâmetros**). Imposto de compra, imposto sobre venda e margem não aparecem no carrinho: são sempre os cadastrados em **Parâmetros**. Há uma **observação geral** (campo *Observações* no resumo) e uma **observação por produto** (campo abaixo da quantidade de cada item). As duas são gravadas com o orçamento, aparecem na folha impressa e voltam ao carrinho quando o orçamento é alterado.
3. **Orçamentos**: tela única com duas abas.
   - **Todos os orçamentos**: lista paginada (20 por página) com filtros por número (`ORC-0005` ou `5`), produto (descrição ou código de qualquer item), período (de/até), faixa de valor total e situação. Clique em uma linha para ver os detalhes; **✎ Editar** carrega o orçamento de volta no carrinho (o carrinho precisa estar vazio).
   - **Detalhes**: folha do orçamento selecionado, com **Editar**, **Gerar pedido** e **Imprimir / Salvar PDF**.
   - **Situação** de cada orçamento: **Aberto** (ao ser gerado) → **Enviado** (botão *✉ Enviar para o Cliente* na lista ou nos detalhes; exige cliente vinculado; dá para voltar para Aberto) → **Pedido gerado** (automático ao gerar o pedido, com o código `PED-…` clicável). Se o pedido for cancelado, o orçamento volta para a situação que tinha (Aberto ou Enviado).
   - Cada mudança de situação fica no histórico (data, hora e usuário), visível nos detalhes junto com as etapas.
   - Só orçamento **Aberto** pode ser alterado. Se estiver **Enviado**, o sistema avisa que ele precisa voltar para Aberto antes (botão *↩ Voltar para aberto* nos detalhes); com **pedido gerado**, nunca. O botão **📦 Gerar pedido** vale para Aberto e Enviado.

   - **Previsão de entrega**: campo de data no resumo do carrinho, gravado com o orçamento. Aparece na folha (impressa e na página do cliente) e passa para o pedido.
   - **Cliente**: escolhido no cadastro de clientes do sistema; veja *Cadastro de clientes* abaixo.
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
5. **Mockups** (opcionais): primeiro gere o orçamento; depois, nos detalhes dele, use **🎨 Mockups** (ou abra *Mockups* no menu e escolha um orçamento **Aberto**). Só é possível criar ou alterar mockups enquanto o orçamento está **Aberto** — depois de enviado ao cliente, com pedido gerado ou cancelado eles ficam só para consulta (voltar para Aberto libera de novo). O estúdio (feito com [Konva](https://konvajs.org/)) mostra os produtos do orçamento; para cada um:
   - escolha a foto do produto (galeria do fornecedor) e adicione **várias logos e textos** (fonte, cor, negrito/itálico);
   - mova, gire e redimensione pelas alças (guias no centro, roda do mouse, setas do teclado, Delete), com **desfazer/refazer** (Ctrl+Z / Ctrl+Y);
   - ajuste mesclagem (multiplicar, normal, sobrepor, tela), acabamento (original, branco, preto, dourado), opacidade, **curvatura** (canecas, garrafas) e **perspectiva**; organize as camadas (frente/trás, duplicar, remover);
   - **Salvar no ORC-…** grava a imagem (1400 px) no item; a edição fica guardada para continuar depois. **Baixar PNG** baixa a imagem.
   Os mockups aparecem na folha do orçamento (tela, impressão/PDF, página do cliente e pedido) numa seção **depois dos valores e quantidades**. Ao alterar os itens do orçamento, cada mockup acompanha o seu produto; o de produto removido é apagado. As imagens ficam em `data/imagens/mockups/` (exigem login; o cliente as vê pelo link do orçamento).

**Cadastros**

6. **Clientes** (*Cadastros › Clientes*): cadastro único dos clientes (`CLI-000001`); veja *Cadastro de clientes* abaixo.
6. **Produtos Próprios**: inclua, busque, altere e exclua produtos da própria empresa. Cada um recebe um código sequencial `PDP-000001`, `PDP-000002`… (códigos excluídos não são reutilizados). A foto pode ser enviada do computador ou informada por URL; os arquivos ficam em `data/imagens/proprios/`. Em *Detalhes do produto* (opcional) informe descrição, material, medidas, peso, capacidade, cor, categoria, personalização e vídeo (YouTube/Vimeo) — aparecem no painel de detalhes do catálogo e, resumidos, no orçamento.
7. **Parâmetros**: tela em abas.
   - **Precificação**: valores da calculadora (material, mão de obra, imposto de compra, designer, logística, imposto sobre venda e margem), com simulação de preço. Material, mão de obra, designer e logística são o ponto de partida de cada item novo; imposto de compra, imposto sobre venda e margem valem sempre para todos os itens do carrinho.
   - **Checklist de fechamento**: itens da lista usada na etapa Em Fechamento dos pedidos (incluir, renomear, reordenar, remover).
   - **Sistema**: configurações gerais. **Enviar notas para o Kommo** (ativo por padrão): desligado, nenhuma nota é criada nem enviada ao Kommo (envio do orçamento, aceite, recusa e pedido gerado); as que já aguardavam reenvio ficam na fila até ser ligado de novo.

**Sistema**

8. **Atualização**: atualiza a base dos fornecedores integrados e mostra o log; com o Kommo religado, mostra também a sincronização dos contatos.

### Comissões

Menu **Comissões** (três telas, cada uma com permissão própria em Acessos). Todo cliente está numa **carteira**; não há regra geral: cada carteira tem a sua tabela de faixas com vigência (percentual fixo = uma faixa só, de R$ 0 sem limite).

- **Parâmetros de comissão**: cadastro das carteiras — nome, descrição, ativa/inativa, marca **Carteira Geral** (exatamente uma; recebe os clientes sem carteira escolhida; não é inativada nem excluída) e as tabelas de cada carteira (faixas progressivas ou percentual fixo, com "vigente a partir de"). Carteira com clientes ativos não é inativada; carteira que já teve cliente ou pedido — inclusive só no histórico de troca de carteira — não é excluída: o `DELETE` devolve 409 com o motivo detalhado, `codigo: 'CARTEIRA_EM_USO'` e `pode_inativar`, e a tela oferece **Inativar agora**. Na lista, *Clientes ativos* conta só os ativos, *Pedidos* não conta os cancelados e *histórico* indica os pedidos que já trocaram de carteira passando por ela. A situação é escolhida como Ativa/Inativa no formulário, com confirmação ao mudar.
- **Carteiras dos clientes** (acesso restrito): clientes por carteira, com troca individual ou em lote — vale para os próximos pedidos e, se pedido, leva os pedidos que ainda não entraram em Em Produção (com histórico no pedido e no cliente); filtro "Para conferir"; aba **Pedidos por carteira** só para consulta.
- **Cliente**: a carteira é escolhida na inclusão (tela Clientes) ou trocada na ficha; sem escolha — e sempre pelo carrinho — entra na Carteira Geral. O **pedido** grava a carteira do cliente quando é criado (manual ou aceite pelo link); pedido antigo sem cliente fica na Carteira Geral até ter o cliente vinculado (**Vincular cliente** nos detalhes do pedido, que passa o pedido para a carteira do cliente, salvo mês de comissão já fechado).
- **Apuração mensal**: prévia do mês, cartões de totais, quadro por carteira, tabela por vendedor com o detalhe de cada carteira (faixa a faixa) e de cada pedido; exportação CSV (Excel) e impressão/PDF; **fechar o mês** grava o resultado (não muda mais), **reabrir** exige motivo; data de pagamento do mês fechado.
- Regras: entra o pedido que chegou pela primeira vez a **Em Produção** no mês (não cancelado e sem ter voltado para antes); base = valor dos produtos **sem frete**; vendedor = responsável pelo orçamento; vale a tabela de cada carteira **vigente no último dia do mês**.
- Cálculo **separado por carteira**: em cada carteira, as vendas do vendedor nela passam pelas faixas daquela carteira; o total do vendedor é a soma. Ex.: Geral R$ 25.000 (2,5% até 10 mil, 4% até 30 mil) = R$ 850; Corporativo R$ 8.000 (3% até 5 mil, 4% acima) = R$ 270; Carteira Raízes R$ 3.000 (1,5% fixo) = R$ 45 → **R$ 1.165,00**.
- **Migração** (uma vez, na primeira subida desta versão, com cópia `data/produtos.db.antes-carteiras.bak`; usa só os dados do banco aberto, então vale para qualquer ambiente): cria a carteira **Inicial** (ou "Carteira Inicial", se o nome já existir), marcada como Carteira Geral, com as tabelas gerais existentes; os percentuais das carteiras antigas viram tabelas de uma faixa; pedidos sem carteira vão para a Inicial; cada cliente recebe a carteira dos seus pedidos — sem pedidos, ou com pedidos em mais de uma carteira, fica na Inicial (este caso com pendência "Para conferir"). Bases migradas antes, em que essa carteira ainda se chama "Geral", têm o nome trocado para "Inicial" uma vez (só a carteira criada pela migração; marca `migracao_carteira_inicial`, cópia `produtos.db.antes-carteira-inicial.bak`). As cópias de segurança das migrações nunca sobrescrevem nem pulam: se já houver uma com o mesmo nome, a nova leva data e hora no nome. Meses já fechados guardam a foto antiga, exibida como "Vendas normais (tabela geral)" + carteiras.

### Ajuda

Menu **Ajuda**, liberado a todos os usuários ativos (ajustável em Acessos):

- **Cálculos** (*Memórias de cálculo*): todas as contas do sistema passo a passo — preço de venda, por que dividir pela margem, custos fixos e faixas, material por técnica (fração mínima, folga, soma por técnica no orçamento), mão de obra, item sem técnica, ajustes, totais e indicadores dos dashboards. Os números dos exemplos são calculados pelas mesmas funções do carrinho. No fim, um **simulador** com os parâmetros e tabelas cadastrados.
- **Manual** (*Manual de operação*): guia completo, tela por tela, com passos, regras, problemas comuns e glossário.
- As duas telas têm sumário e busca no texto (ignora acentos).

### Dashboards

Menu **Dashboards** (central de acompanhamento; novos painéis entram nesse grupo). Permissão por painel na tela Acessos.

- **Visão geral**: filtros de período (hoje, 7/30/90 dias, este mês, mês anterior, este ano ou datas personalizadas) e de vendedor, valendo para todos os indicadores. Cada número é comparado com o período anterior de mesma duração.
  - Destaque para o **valor em pedidos gerados**; cartões de total de pedidos, total de orçamentos, valor em orçamentos, ticket médio, conversão de orçamentos em pedidos (medidor), tempo médio até virar pedido, pedidos com entrega atrasada e entregas dos próximos 7 dias.
  - Gráficos: valor gerado e quantidade por dia/semana/mês (conforme o tamanho do período), funil dos orçamentos, situação atual dos orçamentos, etapa atual dos pedidos, produtos mais vendidos, pedidos por fornecedor e por vendedor. Passe o mouse para ver os valores; *Ver tabela* mostra os números de cada gráfico.
  - Regras: o orçamento conta na data em que foi criado; o pedido, na data em que foi gerado; pedidos cancelados não entram nos totais de pedidos (aparecem só na etapa "Cancelado").

### Link do orçamento (aceite pelo cliente)

*Enviar para o Cliente* gera um link secreto do orçamento (`/o/<código>`, 43 caracteres aleatórios; não há número nem sequência no endereço). A janela que abre mostra o link, **Copiar link** e **Enviar pelo WhatsApp** (telefone do cliente e mensagem prontos); os detalhes do orçamento mostram o link, a validade, se o cliente já abriu, e **Gerar novo link** (o anterior para de funcionar).

- **Página do cliente** (sem login, funciona no celular): mesmo conteúdo da folha impressa, **sem a composição do preço e sem fornecedor**, com *Imprimir / Salvar PDF*, fotos dos produtos e mockups que abrem ampliadas ao toque/clique (janela sobre a página com zoom, setas/deslize entre as fotos, fecha no ✕, Esc, fora da imagem ou no "voltar" do celular; componente `VisualizadorImagens`) e, no fim, **Aceitar orçamento** (observação opcional) e **Rejeitar** (motivo obrigatório).
- **Aceitar** gera o pedido na hora (responsável = responsável pelo orçamento; a movimentação aparece como *Cliente (link)*). **Rejeitar** leva o orçamento a **Cancelado** com o motivo. O cliente responde uma vez só; data, hora, IP e navegador ficam gravados. Os dados confirmados no aceite atualizam o cadastro do cliente do orçamento. Com o Kommo religado, aceite e recusa viram notas no contato (a nota de envio leva o link).
- **Validade**: 7 dias a partir do envio. Vencido, a página continua visível, sem os botões. Orçamento que voltou para Aberto aparece como "em revisão"; ao reenviar, a validade recomeça.
- **Proteções**: código inválido, revogado ou de orçamento não enviado recebe a mesma resposta ("link inválido"); 20 códigos inválidos seguidos bloqueiam o IP por 15 minutos; páginas fora dos buscadores (`noindex`) e sem `Referer`; fotos servidas pelo sistema (o endereço do fornecedor não aparece).
- **Endereço do link**: `APP_URL_PUBLICA` no `.env`; sem ela, o endereço pelo qual a tela foi aberta (IP, domínio ou localhost). No Nginx não use senha (`auth_basic`), senão o cliente não abre o link: ver `deploy/nginx/raizes.conf`.
- **Composição do preço** (custo, impostos, margem): não aparece nos detalhes do orçamento nem do pedido, na folha impressa ou na página do cliente; fica só na calculadora do carrinho. O **fornecedor** aparece só na tela interna (fora da impressão e da página do cliente).

### Dados de faturamento e entrega

- **No orçamento (opcional):** no carrinho, *Faturamento e entrega → + Informar* abre o formulário: empresa (CNPJ) ou pessoa física (CPF), nome/razão social, contato na empresa (opcional), e-mail, CNPJ/CPF e **endereço de faturamento** (CEP, endereço, número, complemento, bairro, cidade, UF) e a **entrega**: "Entregar no mesmo endereço do faturamento" (marcado por padrão) ou outro endereço, com quem recebe, telefone de quem recebe e observação opcionais. O CEP completa os endereços automaticamente (ViaCEP). Só o que foi digitado é conferido (CPF/CNPJ com dígito verificador, e-mail, CEP); dá para enviar o orçamento sem esses dados. Os detalhes do orçamento mostram o resumo.
- **CNPJ alfanumérico:** o CNPJ aceita o formato novo da Receita (desde 1º/07/2026): 12 primeiras posições com letras A–Z ou números e 2 dígitos verificadores numéricos (cada caractere vale o código ASCII − 48; mesmo cálculo de antes para os CNPJs só com números). Minúsculas viram maiúsculas; a máscara é a mesma (`12.ABC.345/01DE-35`) e a busca de clientes encontra o CNPJ com letras, inteiro ou o começo.
- **No aceite pelo link (obrigatório):** ao clicar em *Aceitar orçamento*, o cliente vê o formulário já preenchido com o que foi informado e precisa completar todos os campos obrigatórios para confirmar (entrega em outro endereço: CEP, endereço, número, bairro, cidade e UF).
- **Entrega:** gravada junto com o faturamento (`DadosFaturamento.entrega`, `null` = mesmo endereço) no orçamento e no pedido; o cadastro do cliente guarda o endereço de entrega padrão (`clientes.entrega_json`), que vem para o carrinho ao escolher o cliente e é atualizado pelo aceite e por *Atualizar o cadastro*. A folha e o link mostram os blocos "Faturamento" (com o endereço) e "Entrega". As diferenças vão para o histórico com o prefixo "Entrega ›".
- **No pedido:** os dados confirmados pelo cliente são gravados no orçamento e copiados para o pedido (também quando o pedido é gerado internamente). Uma observação do pedido registra o que o cliente informou ou alterou.
- **Alteração:** nos detalhes do pedido, *Faturamento e entrega → Alterar dados*, enquanto o pedido estiver em andamento (não encerrado nem cancelado). Cada alteração vira uma observação com o que mudou (campo: antes → depois) e quem alterou.

### Tabelas gerais de precificação

Em **Parâmetros › Tabelas gerais** (incluir, alterar e excluir; duplo clique numa linha também altera):

- **Técnicas de personalização**: técnica e descrição. Não pode repetir o nome nem excluir uma técnica usada nas outras tabelas.
- **Material**: técnica (escolhida da tabela de técnicas), preço por m², fração mínima (m²) e folga (%).
- **Mão de obra**: técnica (escolhida da tabela de técnicas) e valor unitário (por peça).
- Cada técnica aparece uma vez em cada tabela.

### Custo de personalização no carrinho

Cada item do carrinho pode ter **até 5 personalizações** (aplicações), cada uma com técnica, local opcional (tampa, frente, verso…) e as medidas da arte em centímetros — ex.: Corte Laser na tampa + Sublimação no corpo. Cada aplicação é calculada como abaixo e o item **soma** o material e a mão de obra de todas. A mesma técnica pode se repetir no item (frente e verso): o material é somado e a mão de obra é cobrada em cada aplicação. As tabelas acima são lidas a cada abertura do carrinho.

- **Material**
  - área da arte (m²) = altura × largura ÷ 10.000
  - área necessária = quantidade × área da arte × (1 + folga da técnica) — a folga entra **antes** do arredondamento
  - material sugerido = área necessária arredondada para cima em frações mínimas — **somando todas as aplicações da mesma técnica no orçamento** (do mesmo item ou de itens diferentes) (arredonda uma vez só; cada item fica com a parte proporcional à sua área). Ex.: 5 cores × 20 un da mesma caneca em DTF UV (arte 8 × 8 cm) = 0,704 m² → 1 m² = R$ 60 para o orçamento, R$ 12 por cor (e não 1 m² por cor)
  - valor = material × preço por m²
- **Mão de obra** = valor unitário da técnica × quantidade.
- Exemplo: 50 canecas, Sublimação (R$ 40/m², fração 0,25 m², folga 10%, mão de obra R$ 2,50), arte 10 × 8 cm → 0,008 m² × 50 × 1,10 = 0,44 m² → **0,5 m²** (2 frações) = **R$ 20,00** de material e R$ 125,00 de mão de obra.
- O operador vê o sugerido e pode **ajustar** o material (m² ou R$ total) e a mão de obra (R$/un); o item fica marcado como *material ajustado* / *mão de obra ajustada* (*Voltar ao sugerido* desfaz). A técnica, o local e as medidas de cada aplicação aparecem para o cliente (link e impressão), numa linha *Personalização* por aplicação; o material usado, os valores e a marcação de ajuste aparecem só na tela interna da folha.
- **Sem técnica** (item sem nenhuma aplicação): material e mão de obra vêm dos valores padrão de **Parâmetros › Precificação** (R$/un, como no cálculo anterior — o preço fica idêntico ao antigo). O operador pode alterar (material como R$ total do lote, mão de obra em R$/un), inclusive para zero; o item fica marcado como ajustado.
- O orçamento não é gerado enquanto alguma aplicação estiver sem técnica escolhida, com técnica sem cadastro completo (Material e Mão de obra) ou com arte sem medidas — a mensagem indica o item e a aplicação.
- Orçamentos anteriores reabertos para edição: item com uma técnica volta com uma aplicação; item sem técnica (ou de antes das tabelas) volta "sem técnica" com os valores que tinha.

### Impressão do orçamento

- A folha (tela, impressão/PDF, pedido e página do cliente) mostra no início os **dados de faturamento e entrega**, quando informados.
- **Parâmetros › Impressão**:
  - **Instruções especiais**: texto livre (condições de pagamento, prazos…) depois dos valores e dos mockups: na tela interna só na versão impressa/PDF; na página do cliente aparece também na tela.
  - **Rodapé**: texto no fim do documento, abaixo da validade (tela e impressão).
  - Campos vazios não aparecem. A mudança vale para todos os orçamentos, inclusive os já enviados.

### Cadastro de clientes

Os clientes ficam no próprio sistema (tela **Clientes**, grupo Cadastros, permissão própria). Código `CLI-000001`; situação **Pré-cadastro** ou **Completo**; nunca são excluídos (inativar/reativar).

- **Empresa e contatos**: a empresa (ou a pessoa física) é o cliente — um cadastro por CNPJ — e cada pessoa que compra por ela é um **contato** (`clientes_pessoas`: nome, cargo/setor, telefone, e-mail, observação; um **principal**; contato usado em orçamento ou pedido é inativado, não excluído). O orçamento grava o contato (`contato_id` + cópia do nome; telefone e e-mail copiados são os do contato, ou os do cliente se ele não tiver) e o pedido herda (`pedidos.contato_id`; com o pedido em andamento, *Trocar* escolhe outro contato ativo do cliente e vira observação). A folha e o link mostram "A/C" o contato — nunca os outros contatos da empresa. Telefone e e-mail dos contatos entram na busca e na duplicidade. **Transformar em contato de…** (ficha ou quadro de duplicidade): o cadastro avulso vira contato da empresa escolhida, com contatos, orçamentos e pedidos (cada um mantém a pessoa), e fica inativo com a referência.
- **Carrinho**: campo **Cliente** com busca única (nome ou razão social sem acento, telefone com ou sem +55 e com ou sem o 9, e-mail, CPF/CNPJ ou `CLI-…`). A busca encontra também pelo nome, telefone ou e-mail de um contato ("Fulano · contato de Empresa X") e já escolhe a pessoa; abaixo do cliente escolhido fica o **Contato** (o principal por padrão; troca e *+ Novo contato…*). **+ Novo cliente** só aparece depois de uma busca e faz o **pré-cadastro**: *Empresa* (nome da empresa, CNPJ opcional e a pessoa que está comprando, que vira o contato principal) ou *Pessoa física* (nome + telefone ou e-mail). CNPJ já cadastrado não cria outra empresa (409 `DOCUMENTO_CADASTRADO` com o cliente): o carrinho oferece *Incluir como contato*. Telefone ou e-mail já usado mostra os cadastros parecidos: *Usar este cliente* ou *Criar mesmo assim* (marca a possível duplicidade). Ao escolher o cliente, o faturamento do cadastro preenche o carrinho. Quem só tem o carrinho vê o resumo do cliente; dados completos, CPF e histórico ficam na tela Clientes.
- O cliente é **obrigatório para gerar ou salvar** o orçamento (carrinho e `POST`/`PUT /api/orcamentos` recusam com 400); orçamento antigo sem cliente só é consultado — para alterá-lo ou gerar pedido, escolha o cliente (gerar pedido sem cliente dá 409).
- **Pedido antigo sem cliente**: *Vincular cliente* nos detalhes (`POST /api/pedidos/:codigo/cliente` `{ cliente_id, usar_faturamento }`) liga o cliente ao pedido e ao orçamento, move a carteira (se o mês não estiver fechado), copia o faturamento do cadastro se pedido e o pedido não tiver, e registra observação, histórico do cliente e movimento de carteira. Pedido cancelado ou já com cliente: 409 (para corrigir, Mesclar). O orçamento grava `cliente_id` e uma cópia de nome, telefone e e-mail; o pedido herda o `cliente_id`.
- **Aceite pelo link**: os dados confirmados atualizam o cliente **desse orçamento** (fica Completo), com o que mudou no histórico (origem *Cliente (link)*). Orçamento antigo sem cliente: o aceite cria o cliente. O **nome** só é trocado pelo aceite enquanto o cliente é pré-cadastro: cliente Completo com outra razão social no aceite mantém o nome, registra a razão social no histórico e fica com a pendência *Razão social diferente no aceite* (`clientes.nome_aceite`; botão *Usar "…"* → `POST /api/clientes/:id/usar-nome-aceite`).
- **Nome nas listas x no documento**: listas de orçamentos e pedidos (`cliente.nome`) e a apuração/pedidos de comissões (nome + código CLI) usam o nome **atual** do cadastro; a folha, a impressão e o link usam a cópia gravada no orçamento (`cliente.nome_orcamento`). Meses de comissão já fechados guardam a foto da época.
- **Duplicidade** — o vínculo decide, não a comparação: o que chega por um orçamento sempre atualiza o cliente daquele orçamento. CPF/CNPJ é único entre os ativos (bloqueia no cadastro manual; no aceite grava e marca o par como *possível duplicidade*); documento diferente do anterior gera a pendência *documento alterado* (botão *Conferido*). Telefone (DDD + 8 últimos dígitos) e e-mail iguais só avisam e marcam o par. Na ficha: **Mesclar** (escolhe o cadastro que fica e o valor de cada campo; orçamentos, pedidos e contatos passam para ele; o outro é inativado com a referência) ou **Não são o mesmo cliente**.
- **Pedido**: alterar o faturamento do pedido não muda o cadastro; o botão *Atualizar o cadastro do cliente com estes dados* leva os dados para o cadastro.
- **Migração dos contatos** (uma vez, marca `migracao_pessoas_contato`, cópia `data/produtos.db.antes-contatos.bak`; usa só o banco aberto): cria o contato principal de cada cliente com o nome (ou a pessoa de contato do faturamento, nas empresas), telefone e e-mail atuais e liga a ele os orçamentos e pedidos existentes. Empresa em pré-cadastro sem pessoa de contato fica com a pendência "Confira o nome da empresa" (o nome do pré-cadastro costuma ser o da pessoa).
- **Migração** (uma vez, na primeira subida desta versão, com cópia `data/produtos.db.antes-clientes.bak`): cria os clientes a partir dos orçamentos existentes (contato do Kommo, nome/telefone e faturamento mais recente), agrupando por código do Kommo, CPF/CNPJ e telefone + nome; liga orçamentos e pedidos; os pares com telefone, e-mail ou documento iguais ficam como possível duplicidade.

### Kommo (desligado)

A integração com o Kommo está **desligada por padrão**: só liga com `KOMMO_ATIVO=1`, `KOMMO_SUBDOMINIO` e `KOMMO_TOKEN` no `.env`. O código do contato do Kommo fica nos clientes migrados só como referência (`clientes.kommo_id`). Religada, ela volta a manter a cópia dos contatos (`clientes_kommo`, a cada `KOMMO_SYNC_MINUTOS`; cartão *Clientes do Kommo* na tela Atualização) e a registrar notas no contato dos clientes que têm esse código (envio do orçamento, aceite, recusa e pedido gerado; podem ser desligadas em *Parâmetros › Sistema*). O sistema nunca cria contatos no Kommo.

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
| `GET /api/orcamentos/:id/mockups` · `GET …/mockups/:item/cena` | Mockups do orçamento / cena do estúdio de um item |
| `PUT /api/orcamentos/:id/mockups/:item` · `DELETE …/mockups/:item` | Grava (`{ imagem: data URL JPG/PNG, cena }`) ou exclui o mockup do item (só com o orçamento Aberto) |
| `GET/POST /api/parametros/tecnicas` · `PUT/DELETE …/tecnicas/:id` | Técnicas de personalização (`{ nome, descricao }`) |
| `GET/POST /api/parametros/material` · `PUT/DELETE …/material/:id` | Material por técnica (`{ tecnica_id, preco_m2, fracao_minima }`) |
| `GET/POST /api/parametros/mao-obra` · `PUT/DELETE …/mao-obra/:id` | Mão de obra por técnica (`{ tecnica_id, valor_unitario }`) |
| `GET/PUT /api/parametros/impressao` | Textos da impressão (`{ instrucoes_especiais, rodape }`) |
| `PUT /api/pedidos/:codigo/faturamento` | Altera os dados de faturamento do pedido em andamento (`{ faturamento }`; registra a mudança nas observações) |
| `POST /api/pedidos/:codigo/cliente` | Vincula cliente a pedido sem cliente (`{ cliente_id, usar_faturamento }`): orçamento, carteira (se o mês não estiver fechado), faturamento opcional e registros; 409 se cancelado ou já com cliente |
| `GET /api/dashboards/geral?de&ate&usuario` · `GET /api/dashboards/usuarios` | Indicadores da Visão geral / vendedores do filtro |
| `GET /api/categorias` · `GET /api/cores` | Categorias / cores com a quantidade de produtos (`?fornecedor=`) |
| `GET/POST /api/produtos-proprios` | Lista (`?q=` busca) / inclui produto próprio |
| `GET/PUT/PATCH/DELETE /api/produtos-proprios/:codigo` | Consulta, substitui, altera campos ou exclui (`PDP-000001`) |
| `GET/PUT /api/parametros` | Lê / grava os parâmetros da calculadora |
| `GET/PUT /api/parametros/checklist` | Cadastro do checklist de fechamento (`{ itens: [{ id?, texto }] }`, na ordem) |
| `PUT /api/pedidos/:codigo/checklist/:item` | Marca/desmarca um item (`{ feito }`; só na etapa Em Fechamento) |
| `GET/PUT /api/parametros/sistema` | Parâmetros de sistema (`{ kommo_notas_ativo }`) |
| `GET /api/orcamentos` | Lista paginada (`numero`, `produto`, `de`, `ate`, `min`, `max`, `status`, `pedido=com\|sem`, `meus=1`, `cliente`, `limit`, `offset`) → `{ total, orcamentos }` (cada um com `pedido` ativo ou `null`) |
| `POST /api/orcamentos` · `GET/PUT /api/orcamentos/:id` | Grava, consulta (com `status`, `movimentos` e `cliente`) e altera (PUT mantém o número; 409 se não estiver Aberto). `entrega_prevista` (AAAA-MM-DD) grava a previsão de entrega; `cliente_id` vincula o cliente do cadastro (400 se não existir ou estiver inativo; ausente no PUT = mantém) |
| `POST /api/orcamentos/:id/status` | Situação manual `{ status: 'ABERTO' \| 'ENVIADO' \| 'CANCELADO', status_atual, motivo? }` (Cancelado exige motivo; Aberto a partir de Cancelado = reabrir) (409 com pedido gerado ou ao enviar sem cliente) |
| `POST /api/orcamentos/:id/link` | Gera um novo link do cliente (o anterior deixa de funcionar) |
| `GET /api/publico/orcamentos/:codigo` | **Sem login** · orçamento para a página do cliente (sem custos nem fornecedor) |
| `GET /api/publico/orcamentos/:codigo/imagem/:n` | **Sem login** · foto do item n |
| `POST /api/publico/orcamentos/:codigo/aceitar` · `.../recusar` | **Sem login** · aceite `{ observacao? }` (gera o pedido) / recusa `{ motivo }` (Cancelado) |
| `GET /api/clientes?busca=&limite=` | Busca rápida no cadastro (ativos; nome, telefone, e-mail, CPF/CNPJ ou `CLI-…`) → `{ clientes }` (telas Clientes, Carrinho, Orçamentos, Pedidos) |
| `GET /api/clientes?busca=&situacao=&ativos=&pendencias=1&limit=&offset=` | Lista da tela Clientes → `{ total, clientes }` |
| `POST /api/clientes` | Inclui (`criar_mesmo_assim` aceita telefone/e-mail repetido; 409 `POSSIVEL_DUPLICIDADE` com `coincidencias`; CPF/CNPJ de outro cliente: 409 `DOCUMENTO_CADASTRADO` com `cliente`). Pelo carrinho, só nome/telefone/e-mail, tipo e CPF/CNPJ; empresa com `pessoa: { nome, cargo?, telefone?, email? }` (vira o contato principal) |
| `GET /api/clientes/:id` · `GET /api/clientes/:id/faturamento` | Ficha (histórico, orçamentos, pedidos, totais, duplicidades; só com a tela Clientes — os demais recebem `{ cliente }`) / faturamento do cadastro para o carrinho |
| `PUT /api/clientes/:id` · `POST /api/clientes/:id/ativo` · `POST /api/clientes/:id/conferido` | Altera / inativa-reativa / limpa a pendência (tela Clientes) |
| `POST /api/clientes/:id/contatos` · `DELETE /api/clientes/:id/contatos/:contato` | Telefones e e-mails adicionais |
| `POST /api/clientes/:id/pessoas` | Inclui contato `{ nome, cargo?, telefone?, email?, observacao?, principal? }` (também pelo carrinho) → `{ pessoa, avisos, cliente }` |
| `PUT /api/clientes/:id/pessoas/:pessoa` · `POST …/principal` · `POST …/ativo` · `DELETE …` | Altera / torna principal / inativa-reativa `{ ativo }` / exclui (só nunca usado; principal não) — tela Clientes |
| `POST /api/clientes/:id/transformar` | `{ destino }`: este cadastro vira contato da empresa destino (contatos, orçamentos e pedidos vão junto; ele fica inativo) |
| `POST /api/pedidos/:codigo/contato` | `{ contato_id }`: troca o contato do pedido em andamento (contato ativo do mesmo cliente; vira observação) |
| `GET /api/clientes/duplicidades` · `POST /api/clientes/duplicidades/:id/descartar` · `POST /api/clientes/mesclar` | Possíveis duplicidades / "não são o mesmo" / mescla `{ principal, outro, escolhas }` |
| `GET /api/kommo/config` · `GET /api/kommo/sincronizacao` · `POST /api/kommo/sincronizar` | Integração do Kommo (desligada por padrão; sincronizar só com a tela Atualização) |
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
