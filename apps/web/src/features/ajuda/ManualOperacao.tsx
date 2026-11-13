import { FLUXO_PEDIDO, ROTULOS_STATUS_PEDIDO } from '@raizes/shared';
import { useApp } from '../../app/contexto';
import { useSessao } from '../../app/sessao';
import { Bt, Dica, Menu, Passos, Secao, Tabela, TelaAjuda } from './componentes';

const SUMARIO = [
  { id: 'man-inicio', titulo: 'Primeiros passos' },
  { id: 'man-fluxo', titulo: 'O fluxo de uma venda' },
  { id: 'man-catalogo', titulo: 'Catálogo' },
  { id: 'man-carrinho', titulo: 'Carrinho' },
  { id: 'man-personalizacao', titulo: 'Personalização no carrinho' },
  { id: 'man-cliente', titulo: 'Cliente, faturamento e entrega' },
  { id: 'man-gerar', titulo: 'Gerar e alterar orçamentos' },
  { id: 'man-orcamentos', titulo: 'Orçamentos' },
  { id: 'man-situacoes', titulo: 'Situações do orçamento' },
  { id: 'man-link', titulo: 'Enviar ao cliente (link)' },
  { id: 'man-pagina-cliente', titulo: 'O que o cliente vê' },
  { id: 'man-mockups', titulo: 'Mockups' },
  { id: 'man-impressao', titulo: 'Impressão e PDF' },
  { id: 'man-pedidos', titulo: 'Pedidos' },
  { id: 'man-etapas', titulo: 'Etapas do pedido' },
  { id: 'man-quadro', titulo: 'Quadro e calendário' },
  { id: 'man-pedido-detalhe', titulo: 'Detalhes do pedido' },
  { id: 'man-dashboards', titulo: 'Dashboards' },
  { id: 'man-comissoes', titulo: 'Comissões' },
  { id: 'man-clientes', titulo: 'Clientes (cadastro)' },
  { id: 'man-proprios', titulo: 'Produtos próprios' },
  { id: 'man-parametros', titulo: 'Parâmetros' },
  { id: 'man-tabelas', titulo: 'Tabelas gerais' },
  { id: 'man-usuarios', titulo: 'Usuários e acessos' },
  { id: 'man-atualizacao', titulo: 'Atualização de produtos' },
  { id: 'man-backup', titulo: 'Backup da base' },
  { id: 'man-kommo', titulo: 'Integração com o Kommo' },
  { id: 'man-problemas', titulo: 'Problemas comuns' },
  { id: 'man-glossario', titulo: 'Glossário' },
];

/** Ajuda › Manual de operação: guia completo de uso do sistema, tela por tela. */
export function ManualOperacao() {
  const { irPara } = useApp();
  const { pode } = useSessao();
  /** Link para outra tela (só quando o usuário tem acesso a ela). */
  const Ir = ({ tela, children }: { tela: Parameters<typeof irPara>[0]; children: string }) =>
    pode(tela) ? (
      <button type="button" className="ajuda-link" onClick={() => irPara(tela)}>
        {children} →
      </button>
    ) : (
      <Menu>{children}</Menu>
    );

  return (
    <TelaAjuda
      tela="ajuda-manual"
      titulo="Manual de operação"
      subtitulo="Guia completo do sistema, tela por tela: o que cada função faz, como usar e quais são as regras. Use a busca acima para achar um assunto."
      sumario={SUMARIO}
    >
      {/* ─────────────────────────────── 1 */}
      <Secao id="man-inicio" titulo="Primeiros passos" numero={1}>
        <h4>Entrar no sistema</h4>
        <Passos
          itens={[
            'Abra o endereço do sistema no navegador (computador ou celular).',
            'Informe o login (só letras e números, sem diferenciar maiúsculas) e a senha.',
            <>
              No primeiro acesso de um usuário criado pelo administrador, troque a senha em <Bt>ícone do usuário</Bt> (canto
              superior direito) › <Bt>Meus dados</Bt>. Enquanto a senha inicial não for trocada, o sistema mostra um aviso.
            </>,
          ]}
        />
        <Tabela
          colunas={['Regra', 'Detalhe']}
          linhas={[
            ['Senha', 'Mínimo de 6 caracteres, com letras e números. Ninguém consegue ver a senha (nem o administrador).'],
            ['Sessão', 'Expira após 12 horas sem uso; é preciso entrar de novo.'],
            ['Segurança', 'Após 5 senhas erradas seguidas, o login fica bloqueado por 5 minutos.'],
            ['Trocar senha', 'Pede a senha atual e encerra as outras sessões abertas do mesmo usuário.'],
          ]}
        />
        <h4>O menu</h4>
        <p>
          O menu fica na barra lateral, em grupos que abrem e fecham como uma sanfona: <b>Dashboards</b>, <b>Vendas</b>,{' '}
          <b>Comissões</b>, <b>Cadastros</b>, <b>Sistema</b> e <b>Ajuda</b>. Clique no nome do grupo para ver as telas dele; só um
          grupo fica aberto por vez, e o grupo da tela em uso abre sozinho. Cada usuário vê só as telas liberadas para ele. O
          botão <Bt>Recolher menu</Bt>, no rodapé da barra, deixa só os ícones (a escolha fica guardada no navegador). O número ao
          lado de <b>Carrinho</b> mostra quantos produtos estão nele.
        </p>
        <Dica>
          Todas as mensagens e confirmações do sistema aparecem em janelas próprias. Leia antes de confirmar: ações como cancelar
          ou gerar pedido ficam registradas no histórico com o seu nome.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 2 */}
      <Secao id="man-fluxo" titulo="O fluxo de uma venda, do começo ao fim" numero={2}>
        <div className="ajuda-fluxo vertical">
          {[
            ['Catálogo', 'Encontre os produtos e coloque no carrinho.'],
            [
              'Carrinho',
              'Quantidades, técnica e tamanho da arte, cliente, faturamento, entrega e frete. O preço é calculado na hora.',
            ],
            ['Gerar Orçamento', 'Grava o orçamento (ORC-0001…) na situação Aberto.'],
            ['Mockups (opcional)', 'Com o orçamento Aberto, monte a imagem de cada produto com a logo do cliente.'],
            ['Enviar para o cliente', 'Gera o link secreto; envie por WhatsApp ou copie. O orçamento fica Enviado.'],
            [
              'Cliente aceita',
              'Pelo link, o cliente completa os dados de faturamento e aceita: o pedido (PED-000001…) nasce na hora.',
            ],
            ['Pedido', 'Criado → Em Fechamento → Em Produção → Produzido → Faturado → Enviado → Encerrado.'],
          ].map(([t, d], i) => (
            <div key={t} className="ajuda-fluxo-passo">
              <span className="ajuda-num">{i + 1}</span>
              <div>
                <b>{t}</b>
                <span>{d}</span>
              </div>
            </div>
          ))}
        </div>
        <Dica>
          O pedido também pode ser gerado internamente (sem o link), com <Bt>📦 Gerar pedido</Bt> nos detalhes do orçamento ou{' '}
          <Bt>+ Novo pedido</Bt> na tela Pedidos.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 3 */}
      <Secao id="man-catalogo" titulo="Catálogo" numero={3}>
        <p>
          Reúne os produtos de todos os fornecedores integrados (Asia Import, So Marcas, Spot Gifts, XBZ) e os produtos próprios
          da empresa. <Ir tela="catalogo">Abrir o Catálogo</Ir>
        </p>
        <h4>Buscar</h4>
        <ul>
          <li>
            Digite nome, código ou parte da descrição. <b>Cada palavra</b> digitada precisa aparecer no produto (ex.: “caneca azul
            400”).
          </li>
          <li>
            Filtros: <b>fornecedor</b>, <b>categoria</b>, <b>cor</b> (as grafias de cada fornecedor são unificadas: “AZUL” e
            “Azul” são a mesma cor) e <b>estoque</b>.
          </li>
          <li>
            <b>Faixa de preço</b>: faixas prontas (até R$ 5 … acima de R$ 200) ou mínimo e máximo digitados. Produtos sem preço
            ficam fora das faixas.
          </li>
          <li>
            <b>Ordenação</b>: por fornecedor (padrão, agrupado), menor preço, maior preço ou nome. Ordenando por preço ou nome, a
            lista deixa de ser agrupada por fornecedor; produtos sem preço vão para o fim.
          </li>
          <li>
            Alterne entre visualização em <b>grade</b> ou <b>lista</b>.
          </li>
        </ul>
        <h4>Detalhes do produto</h4>
        <p>
          O botão <Bt>i</Bt> do cartão abre os detalhes: galeria de fotos, descrição, ficha técnica (material, medidas, peso,
          capacidade, personalização, embalagem, NCM…), vídeo e, nos produtos da So Marcas, o custo por quantidade. Clicar numa
          categoria ou na cor aplica o filtro.
        </p>
        <h4>Colocar no carrinho</h4>
        <p>
          Clique no botão de adicionar do cartão. O produto entra com 1 unidade; quantidade e personalização são definidas no
          carrinho.
        </p>
        <Dica tipo="regra">
          Para o cliente vão apenas o resumo da descrição (até ~200 caracteres), as medidas e o material. Fornecedor, marca, custo
          e tipo de gravação nunca aparecem na folha nem no link.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 4 */}
      <Secao id="man-carrinho" titulo="Carrinho" numero={4}>
        <p>
          É onde o orçamento é montado. Cada item mostra a foto, o nome, o código, o fornecedor e o custo do fornecedor, além do
          preço de venda calculado. <Ir tela="carrinho">Abrir o Carrinho</Ir>
        </p>
        <h4>Em cada item</h4>
        <Tabela
          colunas={['Campo', 'Como usar']}
          linhas={[
            ['Quantidade', 'Botões − e + ou digite e tecle Enter. Ao lado aparece a faixa (pedido pequeno, médio volume…).'],
            ['Observação do produto', 'Cor, posição do logo, gravação… Vai para a folha e para o cliente.'],
            ['Técnica de personalização', 'Escolha a técnica; veja a seção “Personalização no carrinho”.'],
            ['Preço de venda calculado', 'Preço por unidade, com a faixa, o custo total/un e a margem real.'],
            [
              <Bt key="b">⚙ Ajustar custos fixos</Bt>,
              'Designer/mockup e logística deste item (R$ por pedido, divididos pela quantidade).',
            ],
            [<Bt key="b">✕</Bt>, 'Remove o item.'],
          ]}
        />
        <h4>No resumo (lado direito)</h4>
        <ul>
          <li>
            <b>Cliente</b>, <b>Faturamento e entrega</b>, <b>Previsão de entrega</b>, <b>Frete</b> e <b>Observações</b> gerais do
            orçamento.
          </li>
          <li>Subtotal (soma dos itens), frete e total.</li>
          <li>
            <Bt>Gerar Orçamento</Bt> (ou <Bt>Salvar ORC-…</Bt> quando você está alterando um orçamento) e <Bt>Limpar carrinho</Bt>
            .
          </li>
        </ul>
        <Dica tipo="regra">
          Imposto de compra, imposto sobre venda e margem não aparecem no carrinho: valem sempre os cadastrados em Parâmetros. As
          contas completas estão em <Menu>Ajuda › Memórias de cálculo</Menu>.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 5 */}
      <Secao id="man-personalizacao" titulo="Personalização no carrinho (técnicas, arte, material e mão de obra)" numero={5}>
        <p>
          Cada item pode ter <b>até 5 personalizações</b> (aplicações) — por exemplo, Corte Laser na tampa e Sublimação no corpo
          da caneca. Cada aplicação é calculada pelas tabelas da sua técnica e o item soma o material e a mão de obra de todas.
        </p>
        <Passos
          itens={[
            <>
              No bloco <b>Personalização</b> do item, clique em <Bt>+ Adicionar personalização</Bt>.
            </>,
            <>
              Em <Bt>Técnica</Bt>, escolha a técnica. Técnicas marcadas como “cadastro incompleto” ainda não têm valor na tabela
              Material ou Mão de obra.
            </>,
            <>
              Em <Bt>Local (opcional)</Bt>, diga onde vai a arte (tampa, frente, verso…). O local aparece para o cliente.
            </>,
            <>
              Informe <Bt>Altura da arte (cm)</Bt> e <Bt>Largura da arte (cm)</Bt> — o tamanho da área personalizada em cada peça.
            </>,
            <>
              Confira o <b>material sugerido</b> (m², frações, folga e valor) e a <b>mão de obra</b>. Quando outras aplicações do
              orçamento usam a mesma técnica, aparece o quadro roxo com o material somado e a parte desta aplicação.
            </>,
            <>
              Se precisar, altere <Bt>Material (m²)</Bt>, <Bt>Material (R$ total)</Bt> ou <Bt>Mão de obra (R$/un)</Bt> da
              aplicação. Ela ganha o selo <b>MATERIAL AJUSTADO</b> / <b>MÃO DE OBRA AJUSTADA</b>; <Bt>Voltar ao sugerido</Bt>{' '}
              desfaz.
            </>,
            <>
              Para outra técnica no mesmo item, clique de novo em <Bt>+ Adicionar personalização</Bt>. Com duas ou mais, aparece o
              total do item. O <Bt>✕</Bt> de cada cartão remove a aplicação.
            </>,
          ]}
        />
        <Tabela
          colunas={['Regra', 'Como funciona']}
          linhas={[
            [
              'Mesma técnica duas vezes',
              'Permitido (ex.: Sublimação na frente e no verso). A mão de obra é cobrada em cada aplicação.',
            ],
            [
              'Material da mesma técnica',
              'Somado entre todas as aplicações do orçamento (do mesmo item ou de itens diferentes) e arredondado uma vez só.',
            ],
            ['Trocar a técnica', 'Descarta os ajustes da aplicação; local e medidas ficam.'],
            ['Limite', 'Até 5 personalizações por item.'],
          ]}
        />
        <h4>Sem técnica</h4>
        <p>
          Item sem nenhuma aplicação fica <b>sem técnica</b>: o material (R$ total do lote) e a mão de obra (R$/un) começam com os
          valores padrão de <Menu>Parâmetros › Precificação</Menu> e podem ser alterados — inclusive para zero.{' '}
          <Bt>Voltar ao padrão</Bt> desfaz. Ao adicionar a primeira personalização, esses valores deixam de valer (não se misturam
          com as técnicas).
        </p>
        <Dica tipo="atencao">
          O orçamento <b>não é gerado</b> enquanto alguma aplicação estiver sem técnica escolhida, com técnica sem cadastro
          completo ou com a arte sem medida. A mensagem lista o item e a aplicação (ex.: “Caneca Verde: aplicação 2 (Sublimação ·
          Corpo): informe a altura e a largura”). A correção do cadastro é feita em <Menu>Parâmetros › Tabelas gerais</Menu>; ao
          voltar ao carrinho, as tabelas são relidas.
        </Dica>
        <Dica>
          Para o cliente (link e impressão), cada aplicação aparece numa linha <i>Personalização</i> do produto — técnica, local e
          medidas, sem valores nem quantidade de material. O material usado e os ajustes de cada aplicação ficam só na tela
          interna (linhas laranja <i>Interno</i>
          ). Ao editar o orçamento, tudo volta para o carrinho como estava; orçamentos anteriores com uma técnica voltam com uma
          aplicação.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 6 */}
      <Secao id="man-cliente" titulo="Cliente, faturamento e previsão de entrega" numero={6}>
        <h4>Cliente</h4>
        <p>
          O campo <b>Cliente</b> busca no cadastro de clientes do próprio sistema: nome ou razão social (sem acento, por partes),
          telefone (qualquer formato, com ou sem +55 e com ou sem o 9), e-mail, CPF/CNPJ ou o código <b>CLI-000001</b>. Use as
          setas e Enter para escolher. A lista mostra telefone, e-mail, código, cidade, quantos orçamentos o cliente tem e os
          avisos <i>pré-cadastro</i> e <i>possível duplicidade</i>.
        </p>
        <Dica tipo="regra">
          A <b>empresa</b> é o cliente (um cadastro por CNPJ) e cada <b>pessoa</b> que compra por ela é um <b>contato</b> desse
          cliente. A busca também encontra pelo nome, telefone ou e-mail da pessoa: o resultado mostra “Fulano · contato de
          Empresa X” e, ao escolher, já vem esse contato.
        </Dica>
        <Passos
          itens={[
            'Busque primeiro: o botão “+ Novo cliente” só aparece depois de uma busca (para evitar cadastro repetido).',
            <>
              Não é nenhum da lista? <Bt>+ Novo cliente</Bt> e escolha <b>Empresa</b> ou <b>Pessoa física</b>. Empresa: nome da
              empresa, CNPJ (opcional) e a pessoa que está comprando — nome, cargo (opcional), telefone ou e-mail —, que vira o
              contato principal. Pessoa física: nome e telefone ou e-mail. É um <b>pré-cadastro</b>; o resto vem do aceite.
            </>,
            <>
              CNPJ já cadastrado: o sistema não cria outra empresa. Mostra a empresa encontrada e <Bt>Incluir como contato</Bt>{' '}
              coloca a pessoa como contato dela.
            </>,
            <>
              Se o telefone ou o e-mail já estiver em outro cadastro, o sistema mostra quem é: <Bt>Usar este cliente</Bt> ou{' '}
              <Bt>Criar mesmo assim</Bt> (o novo fica marcado como possível duplicidade para a conferência).
            </>,
          ]}
        />
        <ul>
          <li>
            Cliente escolhido: <Bt>Ver cadastro</Bt> (quem tem a tela Clientes), <Bt>Trocar</Bt> e <Bt>Remover</Bt>.
          </li>
          <li>
            <b>Contato</b>: abaixo do cliente escolhido. Vem o contato principal (ou a pessoa encontrada na busca); troque na
            lista ou use <i>+ Novo contato…</i> para incluir outra pessoa da empresa. O orçamento guarda o contato: o telefone e o
            e-mail dele vão para o link e o WhatsApp, a folha mostra “A/C Fulano” e a pessoa de contato do faturamento passa a ser
            ele.
          </li>
          <li>
            Ao escolher o cliente, os dados de faturamento do cadastro preenchem o carrinho (se o carrinho já tiver outros, o
            sistema pergunta qual manter).
          </li>
          <li>
            O cliente é <b>obrigatório</b> para gerar ou salvar o orçamento: sem ele, <Bt>Gerar Orçamento</Bt> avisa “Escolha ou
            inclua o cliente” e leva ao campo. Orçamentos antigos sem cliente continuam abertos para consulta; para alterá-los ou
            gerar pedido, escolha o cliente.
          </li>
          <li>
            O orçamento guarda uma cópia do nome do cliente e do nome, telefone e e-mail do contato do momento (sem telefone ou
            e-mail no contato, os do cliente); o vínculo com o cadastro continua.
          </li>
          <li>
            Listas de orçamentos e pedidos e a apuração de comissões mostram o <b>nome atual do cadastro</b> (na apuração, com o
            código CLI); a folha, a impressão e o link mostram o nome de quando o orçamento foi gerado. Nos detalhes, se forem
            diferentes, aparece “(no orçamento: …)”.
          </li>
        </ul>
        <h4>Faturamento e entrega</h4>
        <Passos
          itens={[
            <>
              Em <b>Faturamento e entrega</b>, clique em <Bt>+ Informar</Bt>.
            </>,
            'Escolha Empresa (CNPJ) ou Pessoa física (CPF) e preencha nome/razão social, contato (opcional, só empresa), e-mail e documento.',
            'Digite o CEP do endereço de faturamento: o endereço é completado automaticamente; complete número e complemento.',
            <>
              <b>Entrega</b>: “Entregar no mesmo endereço do faturamento” vem marcado. Para outro local, desmarque e informe o
              endereço de entrega (também com o CEP) e, se quiser, quem recebe, o telefone de quem recebe e uma observação
              (horário, portaria, ponto de referência).
            </>,
            <>
              <Bt>Usar no orçamento</Bt>.
            </>,
          ]}
        />
        <Dica tipo="regra">
          São dois endereços: o de <b>faturamento</b> (nota e cobrança) e o de <b>entrega</b>. O cadastro do cliente guarda um
          endereço de entrega padrão, que vem junto ao escolher o cliente no carrinho; cada orçamento e pedido guarda a sua
          entrega, que pode ser diferente sem mexer no cadastro. A folha e o link mostram os dois blocos (“Faturamento” e
          “Entrega”, ou “No mesmo endereço do faturamento”).
        </Dica>
        <p>
          No orçamento esses dados são <b>opcionais</b> (só o que foi digitado é conferido: CPF/CNPJ com dígito verificador,
          e-mail e CEP). O CNPJ aceita o <b>formato alfanumérico</b> da Receita (emitido desde julho de 2026, ex.:
          12.ABC.345/01DE-35): as 12 primeiras posições podem ter letras, os 2 dígitos finais são sempre números; letras
          minúsculas viram maiúsculas. No aceite pelo link eles passam a ser <b>obrigatórios</b> para o cliente (a entrega em
          outro endereço também precisa estar completa) e, confirmados, atualizam o cadastro do cliente (que passa a{' '}
          <b>Completo</b>), inclusive o endereço de entrega padrão. Aparecem no início da folha impressa.
        </p>
        <h4>Previsão de entrega e frete</h4>
        <p>
          A <b>previsão de entrega</b> vai para a folha, para o link do cliente e passa para o pedido (base do calendário e dos
          atrasos). O <b>frete</b> é somado ao total, sem margem.
        </p>
      </Secao>

      {/* ─────────────────────────────── 7 */}
      <Secao id="man-gerar" titulo="Gerar e alterar orçamentos" numero={7}>
        <h4>Gerar</h4>
        <p>
          <Bt>Gerar Orçamento</Bt> grava o orçamento com o próximo número (ORC-0001, ORC-0002…), esvazia o carrinho e abre os
          detalhes. O orçamento nasce <b>Aberto</b> e guarda você como responsável.
        </p>
        <h4>Alterar</h4>
        <Passos
          itens={[
            <>
              O orçamento precisa estar <b>Aberto</b>. Se estiver Enviado, use <Bt>↩ Voltar para aberto</Bt> nos detalhes.
            </>,
            'O carrinho precisa estar vazio.',
            <>
              Clique em <Bt>✎ Editar</Bt> (na lista ou nos detalhes): os itens, quantidades, personalização, cliente, faturamento,
              frete, observações e previsão voltam ao carrinho.
            </>,
            <>
              Faça as mudanças e clique em <Bt>Salvar ORC-…</Bt>. O número continua o mesmo e a data da alteração e o usuário que
              alterou ficam registrados. Não há limite de alterações.
            </>,
          ]}
        />
        <Dica>
          Desistiu? <Bt>Limpar carrinho</Bt> sai da alteração sem modificar o orçamento salvo. Mockups acompanham o produto; o
          mockup de um produto removido é apagado.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 8 */}
      <Secao id="man-orcamentos" titulo="Orçamentos: lista e detalhes" numero={8}>
        <p>
          Tela com duas abas. <Ir tela="orcamentos">Abrir Orçamentos</Ir>
        </p>
        <h4>Todos os orçamentos</h4>
        <ul>
          <li>Lista paginada (20 por página), do mais recente para o mais antigo.</li>
          <li>
            Filtros: número (<i>ORC-0005</i> ou <i>5</i>), produto (descrição ou código de qualquer item), cliente, período, faixa
            de valor total, situação e <Bt>Somente os meus</Bt>.
          </li>
          <li>Clique na linha para abrir os detalhes. Na própria linha há atalhos para editar e enviar.</li>
        </ul>
        <h4>Detalhes</h4>
        <ul>
          <li>Folha do orçamento (igual à impressa), com cliente, responsável, situação e etapas com data, hora e usuário.</li>
          <li>
            Botões, conforme a situação: <Bt>✎ Editar</Bt>, <Bt>✉ Enviar para o Cliente</Bt>, <Bt>↩ Voltar para aberto</Bt>,{' '}
            <Bt>📦 Gerar pedido</Bt>, <Bt>🎨 Mockups</Bt>, <Bt>Cancelar orçamento</Bt>, <Bt>↺ Reabrir</Bt> e{' '}
            <Bt>🖨 Imprimir / Salvar PDF</Bt>.
          </li>
          <li>Link do cliente (validade, se já foi aberto, copiar, gerar novo link) e dados de faturamento.</li>
        </ul>
      </Secao>

      {/* ─────────────────────────────── 9 */}
      <Secao id="man-situacoes" titulo="Situações do orçamento" numero={9}>
        <Tabela
          colunas={['Situação', 'Quando', 'O que pode ser feito']}
          linhas={[
            [
              'Aberto',
              'Ao gerar; ao voltar de Enviado; ao reabrir um cancelado',
              'Editar, criar mockups, enviar, gerar pedido, cancelar',
            ],
            ['Enviado', 'Ao clicar em Enviar para o Cliente', 'Voltar para aberto, gerar pedido, cancelar, gerar novo link'],
            [
              'Pedido gerado',
              'Automático ao gerar o pedido (pelo sistema ou pelo aceite do cliente)',
              'Só consulta; o código PED-… é clicável',
            ],
            ['Cancelado', 'Cancelamento manual (com motivo) ou recusa do cliente pelo link', 'Reabrir (volta para Aberto)'],
          ]}
        />
        <Dica tipo="regra">
          Só orçamento <b>Aberto</b> pode ser alterado. Orçamento com pedido gerado nunca é alterado nem cancelado — cancela-se o
          pedido, e o orçamento volta para a situação que tinha antes (Aberto ou Enviado). Toda mudança de situação fica no
          histórico.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 10 */}
      <Secao id="man-link" titulo="Enviar o orçamento ao cliente (link)" numero={10}>
        <Passos
          itens={[
            'Confira o orçamento e o cliente vinculado.',
            <>
              Clique em <Bt>✉ Enviar para o Cliente</Bt>. O orçamento passa para <b>Enviado</b> e abre a janela do link.
            </>,
            <>
              Use <Bt>Enviar pelo WhatsApp</Bt> (telefone e mensagem prontos) ou <Bt>Copiar link</Bt> para mandar por outro canal.
            </>,
            'Acompanhe nos detalhes: validade, se o cliente já abriu o link e a resposta.',
          ]}
        />
        <Tabela
          colunas={['Regra', 'Detalhe']}
          linhas={[
            ['Validade', '7 dias a partir do envio. Vencido, o cliente ainda vê o orçamento, mas sem os botões de resposta.'],
            ['Novo link', 'Gerar novo link invalida o anterior na hora.'],
            ['Em revisão', 'Se o orçamento voltar para Aberto, o link mostra “em revisão”. Ao reenviar, a validade recomeça.'],
            ['Uma resposta', 'O cliente aceita ou rejeita uma única vez; data, hora, IP e navegador ficam gravados.'],
            [
              'Cadastro',
              'Os dados confirmados no aceite atualizam o cadastro do cliente deste orçamento, com registro no histórico.',
            ],
          ]}
        />
      </Secao>

      {/* ─────────────────────────────── 11 */}
      <Secao id="man-pagina-cliente" titulo="O que o cliente vê no link" numero={11}>
        <ul>
          <li>
            A mesma folha impressa: produtos, fotos, quantidades, preço unitário e total, frete, previsão de entrega e mockups.
          </li>
          <li>
            <b>Nunca</b>: custo, composição do preço, fornecedor, usuários ou dados internos.
          </li>
          <li>
            <b>Fotos ampliadas:</b> tocando ou clicando na foto do produto ou no mockup (ícone ⤢), a imagem abre grande numa
            janela sobre a página. Um toque/clique dá zoom no ponto escolhido (arraste para ver o resto); as setas, as teclas ← →
            ou o deslizar do dedo passam para as outras fotos; fecha no ✕, com Esc, tocando fora da imagem ou com o “voltar” do
            celular (sem sair do orçamento).
          </li>
          <li>Cada personalização do produto — técnica, local e medidas da arte — sem valores nem material.</li>
          <li>As instruções especiais de Parâmetros › Impressão, logo após os valores e mockups.</li>
          <li>Botão de imprimir/salvar PDF.</li>
          <li>
            <Bt>Aceitar orçamento</Bt>: abre o formulário de faturamento já preenchido com o que foi informado; o cliente completa
            os campos obrigatórios e confirma (observação opcional). O pedido é gerado na hora e a movimentação aparece como{' '}
            <i>Cliente (link)</i>.
          </li>
          <li>
            <Bt>Rejeitar</Bt>: exige o motivo; o orçamento vai para <b>Cancelado</b> com o motivo registrado.
          </li>
        </ul>
        <Dica>A página funciona no celular e não precisa de login.</Dica>
      </Secao>

      {/* ─────────────────────────────── 12 */}
      <Secao id="man-mockups" titulo="Mockups" numero={12}>
        <p>
          Imagem de cada produto com a logo do cliente. É opcional e só pode ser criada ou alterada com o orçamento <b>Aberto</b>{' '}
          (depois de enviado, fica para consulta; voltar para Aberto libera de novo). <Ir tela="mockup">Abrir Mockups</Ir>
        </p>
        <Passos
          itens={[
            <>
              Gere o orçamento. Nos detalhes, clique em <Bt>🎨 Mockups</Bt> (ou abra <Menu>Vendas › Mockups</Menu> e escolha um
              orçamento Aberto).
            </>,
            'Escolha o produto e a foto de fundo (galeria do fornecedor).',
            'Adicione uma ou várias logos (arquivo de imagem) e textos (fonte, cor, negrito, itálico).',
            'Posicione: arraste, gire e redimensione pelas alças. Guias aparecem no centro; setas do teclado movem com precisão; Delete remove.',
            'Ajuste mesclagem (multiplicar, normal, sobrepor, tela), acabamento (original, branco, preto, dourado), opacidade, curvatura (canecas, garrafas) e perspectiva.',
            'Organize as camadas (frente/trás, duplicar, remover). Ctrl+Z desfaz e Ctrl+Y refaz.',
            <>
              <Bt>Salvar no ORC-…</Bt> grava a imagem no item (a edição fica guardada para continuar depois). <Bt>Baixar PNG</Bt>{' '}
              baixa o arquivo.
            </>,
          ]}
        />
        <Dica>
          Os mockups aparecem na folha (tela, impressão, link do cliente e pedido) numa seção depois dos valores. Use logos em PNG
          com fundo transparente para o melhor resultado.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 13 */}
      <Secao id="man-impressao" titulo="Impressão e PDF" numero={13}>
        <p>
          <Bt>🖨 Imprimir / Salvar PDF</Bt> abre a impressão do navegador; para PDF, escolha “Salvar como PDF” como impressora.
        </p>
        <Tabela
          colunas={['Parte da folha', 'Tela interna', 'Impressão / PDF', 'Link do cliente']}
          linhas={[
            ['Dados de faturamento e entrega', 'Sim', 'Sim (no início)', 'Sim'],
            ['Produtos, quantidades e valores', 'Sim', 'Sim', 'Sim'],
            ['Técnica de personalização e medidas da arte', 'Sim', 'Sim', 'Sim'],
            ['Fornecedor, material usado e ajustes', 'Sim', 'Não', 'Não'],
            ['Mockups', 'Sim', 'Sim', 'Sim'],
            ['Instruções especiais', 'Não', 'Sim', 'Sim'],
            ['Rodapé e validade', 'Sim', 'Sim', 'Sim'],
          ]}
        />
        <p>
          Instruções especiais e rodapé são cadastrados em <Menu>Parâmetros › Impressão</Menu> e valem para todos os orçamentos,
          inclusive os já enviados.
        </p>
      </Secao>

      {/* ─────────────────────────────── 14 */}
      <Secao id="man-pedidos" titulo="Pedidos" numero={14}>
        <p>
          Todo pedido nasce de um orçamento e recebe o código PED-000001, PED-000002… <Ir tela="pedidos">Abrir Pedidos</Ir>
        </p>
        <h4>Gerar um pedido internamente</h4>
        <Passos
          itens={[
            <>
              Nos detalhes do orçamento (Aberto ou Enviado), clique em <Bt>📦 Gerar pedido</Bt> — ou, em Pedidos,{' '}
              <Bt>+ Novo pedido</Bt> e escolha o orçamento.
            </>,
            'Informe uma observação, se quiser (vira o primeiro registro do histórico do pedido).',
            'Confirme. O orçamento passa para Pedido gerado e os dados de faturamento são copiados para o pedido.',
          ]}
        />
        <Dica tipo="regra">Orçamento sem cliente não gera pedido: edite o orçamento no carrinho e escolha o cliente antes.</Dica>
        <Tabela
          colunas={['Aba', 'Para que serve']}
          linhas={[
            [
              'Todos os pedidos',
              'Lista paginada com filtros por código, orçamento, cliente, situação (inclui “Em andamento”), período e Somente os meus.',
            ],
            ['Quadro', 'Kanban por etapa, para mover os pedidos no dia a dia.'],
            ['Calendário', 'Entregas previstas por semana ou mês (só consulta).'],
            ['Detalhes', 'Tudo sobre um pedido: etapas, checklist, observações, faturamento e itens.'],
          ]}
        />
        <Dica tipo="regra">
          Pedidos não são editados. Se algo estiver errado, <Bt>Cancelar pedido</Bt> (com motivo): o orçamento fica livre para ser
          corrigido e gerar outro pedido. Nunca há dois pedidos ativos para o mesmo orçamento; pedido encerrado não pode ser
          cancelado.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 15 */}
      <Secao id="man-etapas" titulo="Etapas do pedido" numero={15}>
        <div className="ajuda-etapas">
          {FLUXO_PEDIDO.map((s, i) => (
            <span key={s} className={`ajuda-etapa etapa-${i}`}>
              {ROTULOS_STATUS_PEDIDO[s]}
            </span>
          ))}
        </div>
        <ul>
          <li>
            <Bt>→ Mover para …</Bt> (nos detalhes ou na lista) leva o pedido para a próxima etapa, depois de confirmar.
          </li>
          <li>Cada movimentação grava data, hora e usuário — é a base do tempo em cada etapa (SLA).</li>
          <li>No Quadro, também é possível voltar uma etapa; o retorno fica registrado.</li>
        </ul>
        <h4>Checklist de fechamento</h4>
        <p>
          Ao entrar em <b>Em Fechamento</b>, o pedido recebe a lista de <Menu>Parâmetros › Checklist de fechamento</Menu>. Marque
          cada item nos detalhes (grava data, hora e usuário). Só pode ser marcado nessa etapa e não trava o fluxo: o pedido
          avança mesmo com itens em aberto. O cartão do Quadro mostra o progresso (☑ 2/3).
        </p>
      </Secao>

      {/* ─────────────────────────────── 16 */}
      <Secao id="man-quadro" titulo="Quadro e calendário" numero={16}>
        <h4>Quadro</h4>
        <ul>
          <li>Uma coluna por etapa, nas cores das etiquetas, com o total da etapa.</li>
          <li>Até 20 pedidos por coluna, os que estão há mais tempo na etapa primeiro (em Encerrado, os mais recentes).</li>
          <li>
            Arraste o cartão — ou use <Bt>‹</Bt> <Bt>›</Bt> — <b>apenas</b> para a etapa anterior ou a próxima.
          </li>
          <li>O cartão mostra código, cliente, valor, entrega prevista e o progresso do checklist. Cancelados não aparecem.</li>
        </ul>
        <h4>Calendário</h4>
        <ul>
          <li>Pedidos não encerrados distribuídos pela data prevista de entrega, em visão de semana ou mês.</li>
          <li>
            <Bt>‹ Hoje ›</Bt> navega; também dá para escolher mês/ano. Entregas vencidas aparecem como <i>atrasado</i>.
          </li>
          <li>
            Pedidos sem data ficam numa lista abaixo. Clique no cartão para abrir os detalhes; nada é movimentado no calendário.
          </li>
        </ul>
      </Secao>

      {/* ─────────────────────────────── 17 */}
      <Secao id="man-pedido-detalhe" titulo="Detalhes do pedido" numero={17}>
        <Tabela
          colunas={['Bloco', 'O que faz']}
          linhas={[
            ['Etapas', 'Data e hora de cada etapa, tempo total e tempo em cada etapa.'],
            [
              'Entrega prevista',
              'Pode ser alterada só na etapa Criado; cada mudança vira uma observação (“alterada de … para …”).',
            ],
            [
              'Contato',
              <span key="c">
                A pessoa de contato do pedido (vem do orçamento). Com o pedido em andamento, <Bt>Trocar</Bt> escolhe outro contato
                ativo do cliente; a troca vira observação (“Contato: antes → depois”).
              </span>,
            ],
            [
              'Faturamento e entrega',
              <span key="f">
                Os dois endereços (faturamento e entrega). Alteráveis com o pedido em andamento (<Bt>Alterar dados</Bt>); cada
                mudança vira observação com o antes → depois (as da entrega com “Entrega ›”).
              </span>,
            ],
            [
              'Frete',
              <span key="fr">
                Abaixo do total. De <b>Criado até Produzido</b>, <Bt>✎ alterar</Bt> muda o frete do pedido, com motivo
                obrigatório; a mudança vira observação (“Frete alterado: antes → depois. Motivo: …”). O total do pedido, a lista,
                o quadro, a folha do pedido e os dashboards passam a usar o novo valor; o orçamento e o link do cliente continuam
                com o frete aceito (aparece “orçamento: R$ …” ao lado). A comissão não muda, porque não inclui o frete.
              </span>,
            ],
            [
              'Vincular cliente',
              <span key="v">
                Só em pedido antigo sem cliente (e não cancelado): busque ou inclua o cliente, como no carrinho, e confirme. O
                cliente fica ligado ao pedido e ao orçamento; a carteira do pedido passa a ser a do cliente (se o mês da comissão
                já estiver fechado, a carteira é mantida); se o pedido não tiver faturamento, o sistema oferece usar o do
                cadastro. Tudo fica nas observações do pedido, no histórico do cliente e no histórico de carteira. Depois de
                vinculado não se troca por aqui — para corrigir, use <Bt>Mesclar</Bt> na tela Clientes.
              </span>,
            ],
            ['Checklist', 'Itens de fechamento (marcáveis em Em Fechamento).'],
            [
              'Observações',
              <span key="o">
                Linha do tempo (mais recente no topo). <Bt>+ Incluir observação</Bt> em qualquer situação; registros não são
                editados nem apagados. A caixa mostra 10 linhas e rola.
              </span>,
            ],
            ['Itens', 'Produtos do orçamento, com a folha completa.'],
          ]}
        />
      </Secao>

      {/* ─────────────────────────────── 18 */}
      <Secao id="man-dashboards" titulo="Dashboards" numero={18}>
        <p>
          Central de acompanhamento. <Ir tela="dash-geral">Abrir a Visão geral</Ir>
        </p>
        <ul>
          <li>
            <b>Período</b>: hoje, 7/30/90 dias, este mês, mês anterior, este ano ou datas personalizadas. <b>Vendedor</b>: todos
            ou um usuário.
          </li>
          <li>Cartões com os principais números e a variação em relação ao período anterior de mesma duração.</li>
          <li>
            Gráficos: evolução no tempo, funil, situação dos orçamentos, etapas dos pedidos, produtos, fornecedores e vendedores.
          </li>
          <li>
            Passe o mouse para ver os valores; <Bt>Ver tabela</Bt> mostra os números de cada gráfico.
          </li>
        </ul>
        <Dica>
          Como cada indicador é calculado: <Menu>Ajuda › Memórias de cálculo › Indicadores dos dashboards</Menu>.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── clientes */}
      <Secao id="man-clientes" titulo="Clientes (cadastro)" numero={19}>
        <p>
          Cadastro único dos clientes, com código <b>CLI-000001</b>. Nasce como <b>pré-cadastro</b> no carrinho (nome + telefone
          ou e-mail) e fica <b>Completo</b> quando os dados de faturamento são confirmados no aceite pelo link.{' '}
          <Ir tela="clientes">Abrir Clientes</Ir>
        </p>
        <h4>Lista</h4>
        <ul>
          <li>
            Busca por nome, telefone, e-mail, CPF/CNPJ (inteiro ou o começo, inclusive com letras) ou código; filtros de situação,
            ativos/inativos e “Com pendência”.
          </li>
          <li>Clique na linha para abrir a ficha.</li>
          <li>
            <Bt>+ Novo cliente</Bt> abre o formulário completo. CPF/CNPJ já cadastrado <b>bloqueia</b>; telefone ou e-mail
            repetido avisa e permite criar mesmo assim (marcando a possível duplicidade).
          </li>
        </ul>
        <h4>Ficha do cliente</h4>
        <ul>
          <li>
            Dados (os mesmos do faturamento, mais telefone principal, <b>endereço de entrega padrão</b> — ou “mesmo do
            faturamento” — e observações internas) e <Bt>Salvar alterações</Bt>.
          </li>
          <li>
            <b>Carteira</b> (comissões): mostrada no topo da ficha; <Bt>Mudar carteira</Bt> vale para os próximos pedidos e pode
            levar os que ainda não entraram em produção.
          </li>
          <li>
            <b>Contatos (pessoas)</b>: quem compra pela empresa — nome, cargo/setor, telefone, e-mail e observação. Um é o{' '}
            <b>principal</b> (vem primeiro no carrinho). <Bt>+ Novo contato</Bt>, <i>alterar</i>, <i>tornar principal</i>,{' '}
            <i>inativar</i>/<i>reativar</i> (quem saiu da empresa) e <i>excluir</i> (só contato nunca usado em orçamento ou
            pedido; o principal não é inativado nem excluído — marque outro antes). Tudo vai para o histórico. Pelo carrinho, o
            vendedor só inclui contatos novos.
          </li>
          <li>
            Telefones e e-mails adicionais da empresa (canais como central e financeiro, não pessoas), com descrição. Também são
            usados na busca e na conferência de duplicidade, assim como os dos contatos.
          </li>
          <li>
            <Bt>Transformar em contato de…</Bt>: quando um cadastro avulso é, na verdade, uma pessoa de uma empresa já cadastrada.
            Escolha a empresa: os contatos, orçamentos e pedidos passam para ela (cada um mantém a sua pessoa de contato) e o
            cadastro avulso fica inativo com a referência.
          </li>
          <li>
            Totais, pedidos e orçamentos do cliente, e o <b>histórico</b>: quem alterou o quê, quando e por onde (cadastro,
            carrinho, aceite pelo link, pedido, mesclagem).
          </li>
          <li>
            <Bt>Inativar</Bt> / <Bt>Reativar</Bt>: clientes nunca são excluídos; o inativo some das buscas, mas continua nos
            orçamentos e pedidos.
          </li>
        </ul>
        <h4>Atualização x duplicidade</h4>
        <Tabela
          colunas={['Situação', 'O que o sistema faz']}
          linhas={[
            [
              'Dados chegam por um orçamento (aceite, pedido)',
              'Atualizam sempre o cliente ligado a esse orçamento — nunca outro.',
            ],
            ['Aceite com CPF/CNPJ novo ou igual', 'Atualiza o cadastro (fica Completo) e registra o que mudou no histórico.'],
            [
              'Aceite de cliente já Completo com outra razão social',
              'O nome do cadastro não muda (só o pré-cadastro recebe o nome do aceite). A razão social informada vai para o histórico e fica a pendência “Razão social diferente no aceite”: Usar “…” troca o nome; Conferido mantém o atual.',
            ],
            [
              'Aceite com CPF/CNPJ diferente do que o cliente tinha',
              'Atualiza e deixa a pendência “documento alterado”: confira e clique em Conferido.',
            ],
            [
              'Aceite com CPF/CNPJ que já é de outro cliente',
              'Não bloqueia o cliente: grava no cliente do orçamento e marca os dois como possível duplicidade. Se o do orçamento era pré-cadastro, fica a pendência “parece ser um contato dessa empresa”.',
            ],
            ['Cadastro manual com CPF/CNPJ de outro cliente', 'Bloqueia (o documento é único entre os ativos).'],
            [
              'Carrinho com CNPJ de outro cliente',
              'Não cria outra empresa: oferece incluir a pessoa como contato da empresa encontrada.',
            ],
            ['Telefone ou e-mail iguais', 'Avisa e permite seguir; o par fica marcado como possível duplicidade.'],
            ['Nome parecido', 'Só aparece como sugestão na busca.'],
          ]}
        />
        <h4>Possível duplicidade</h4>
        <Passos
          itens={[
            'Filtre por “Com pendência” e abra o cliente.',
            <>
              No quadro <i>Possível duplicidade</i>, compare com o outro cadastro. Se forem diferentes,{' '}
              <Bt>Não são o mesmo cliente</Bt> (a suspeita não volta).
            </>,
            <>
              Se forem o mesmo, <Bt>Mesclar</Bt>: escolha qual cadastro fica e, campo a campo, qual valor vale. Orçamentos,
              pedidos e contatos passam para o que fica; o outro é inativado com a referência. Tudo vai para o histórico dos dois.
            </>,
            <>
              Se um deles é uma pessoa da empresa do outro (ex.: pré-cadastro de um comprador e a empresa já cadastrada), use{' '}
              <Bt>Virar contato de …</Bt> / <Bt>Trazer … como contato</Bt>: o pré-cadastro vira contato da empresa.
            </>,
          ]}
        />
        <h4>Pedido</h4>
        <p>
          Alterar o faturamento do pedido <b>não</b> muda o cadastro sozinho. Para levar os dados ao cadastro, use{' '}
          <Bt>Atualizar o cadastro do cliente com estes dados</Bt> nos detalhes do pedido.
        </p>
        <Dica>
          CPF, endereço e histórico só aparecem para quem tem a tela Clientes. Vendedores (carrinho) só buscam, fazem o
          pré-cadastro e incluem contatos novos.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 19 */}
      <Secao id="man-comissoes" titulo="Comissões dos vendedores" numero={20}>
        <p>
          Grupo <b>Comissões</b> do menu, com três telas, cada uma com permissão própria em Acessos. As contas estão em{' '}
          <Menu>Ajuda › Memórias de cálculo › Comissões</Menu>.
        </p>
        <Dica tipo="regra">
          Todo cliente está numa <b>carteira</b>; o pedido recebe a carteira do cliente quando é criado e a comissão usa a tabela
          dessa carteira. Não há regra geral: cada carteira tem as suas faixas. Cliente sem carteira escolhida entra na carteira
          marcada como <b>Carteira Geral</b> (sempre uma).
        </Dica>
        <h4>1. Parâmetros de comissão (carteiras)</h4>
        <ul>
          <li>
            <Bt>+ Incluir</Bt> uma carteira: nome, descrição e, se quiser, já um percentual fixo com vigência. Marque{' '}
            <b>Carteira Geral</b> para que ela receba os clientes sem carteira (a marca sai da carteira anterior).
          </li>
          <li>
            Abra a carteira e use <Bt>+ Nova vigência</Bt> para incluir a tabela: <b>faixas progressivas</b> (até quanto e o %;
            cada faixa começa onde a anterior termina e a última vale para tudo acima) ou <b>percentual fixo</b>. A nova tabela
            vem preenchida com a mais recente; as anteriores continuam valendo para os meses delas.
          </li>
          <li>
            A carteira criada na mudança para carteiras de clientes se chama <b>Inicial</b> e começa marcada como Carteira Geral.
            O nome e a marca são independentes: a marca pode passar para outra carteira, e a Inicial vira uma carteira comum.
          </li>
          <li>
            Na lista, <b>Clientes ativos</b> conta só os clientes ativos e <b>Pedidos</b> não conta os cancelados; “histórico: N
            pedidos” indica pedidos que já trocaram de carteira passando por ela.
          </li>
          <li>
            A Carteira Geral não é inativada nem excluída. Carteira com clientes ativos não é inativada: mova os clientes antes.
            Carteira que já teve cliente ou pedido — inclusive só no histórico de troca de carteira — não é excluída: ao tentar, o
            sistema mostra o motivo e oferece <Bt>Inativar agora</Bt>. Para inativar pelo ✎, escolha <b>Situação: Inativa</b> e
            salve; a confirmação aparece na tela.
          </li>
        </ul>
        <h4>2. Carteiras dos clientes (acesso restrito)</h4>
        <Passos
          itens={[
            'Na aba Clientes, filtre por nome/telefone/documento, pela carteira ou por “Para conferir”.',
            'Marque um ou vários clientes na caixa de seleção.',
            <>
              Escolha a carteira e clique em <Bt>Mover</Bt>. Vale para os próximos pedidos; o sistema pergunta se leva também os
              pedidos que ainda não entraram em produção (os que já entraram continuam na carteira de antes).
            </>,
            <>
              A aba <b>Pedidos por carteira</b> é só consulta; <Bt>Histórico</Bt> mostra quando a carteira do pedido mudou.
            </>,
          ]}
        />
        <p>
          A carteira também é escolhida na inclusão do cliente e trocada na ficha (<Menu>Cadastros › Clientes</Menu>), por quem
          tem essas telas. O cliente incluído pelo carrinho entra na Carteira Geral.
        </p>
        <h4>3. Apuração mensal</h4>
        <ul>
          <li>
            Escolha o mês: a tela mostra a <b>prévia</b>, recalculada com os dados atuais a cada abertura.
          </li>
          <li>
            Cartões com o total de comissões e de pedidos; quadro por carteira (tabela usada, vendas e comissão); tabela por
            vendedor com o total a pagar. Clique no vendedor para ver a conta de cada carteira, faixa a faixa, e pedido a pedido.
          </li>
          <li>
            <Bt>⬇ Exportar planilha (CSV)</Bt> gera o arquivo para o Excel (um pedido por linha e o resumo por vendedor);{' '}
            <Bt>🖨 Imprimir / PDF</Bt> imprime o relatório.
          </li>
          <li>
            <Bt>🔒 Fechar mês</Bt> grava o resultado: daí em diante ele não muda. Depois de fechado, registre a data em{' '}
            <Bt>Registrar pagamento</Bt>. <Bt>↺ Reabrir mês</Bt> (motivo obrigatório) volta à prévia. Tudo fica no histórico do
            mês.
          </li>
          <li>
            Avisos em laranja indicam o que pede atenção: carteira sem tabela vigente no mês. Meses fechados antes das carteiras
            de clientes mostram a foto antiga, com “Vendas normais (tabela geral)”.
          </li>
        </ul>
      </Secao>

      <Secao id="man-proprios" titulo="Produtos próprios" numero={21}>
        <p>
          Produtos da própria empresa, que aparecem no catálogo junto com os dos fornecedores.{' '}
          <Ir tela="produtos-proprios">Abrir Produtos Próprios</Ir>
        </p>
        <Passos
          itens={[
            'Clique em incluir e informe nome, custo e estoque.',
            'Foto: envie do computador ou informe a URL.',
            'Em Detalhes do produto (opcional): descrição, material, medidas, peso, capacidade, cor, categoria, personalização e vídeo (YouTube/Vimeo).',
            'Salve. O produto recebe o código PDP-000001, PDP-000002… (códigos excluídos não são reutilizados).',
          ]}
        />
      </Secao>

      {/* ─────────────────────────────── 20 */}
      <Secao id="man-parametros" titulo="Parâmetros" numero={22}>
        <p>
          Configurações que afetam preços, pedidos e impressão. <Ir tela="parametros">Abrir Parâmetros</Ir>
        </p>
        <Tabela
          colunas={['Aba', 'O que configura']}
          linhas={[
            [
              'Precificação',
              'Material e mão de obra padrão dos itens sem técnica, imposto de compra (e se é aplicado), designer, logística, imposto sobre venda e margem. Mostra uma simulação ao lado. Vale para os próximos cálculos do carrinho (orçamentos já gerados não mudam).',
            ],
            ['Tabelas gerais', 'Técnicas de personalização, Material por técnica e Mão de obra por técnica.'],
            [
              'Checklist de fechamento',
              'Itens da lista usada em Em Fechamento (incluir, renomear, reordenar, remover). Vale para os próximos pedidos.',
            ],
            ['Impressão', 'Instruções especiais (só na impressão/PDF) e rodapé.'],
            ['Sistema', 'Enviar notas para o Kommo (só vale com a integração religada no servidor).'],
          ]}
        />
      </Secao>

      {/* ─────────────────────────────── 21 */}
      <Secao id="man-tabelas" titulo="Tabelas gerais de precificação" numero={23}>
        <Passos
          itens={[
            <>
              Cadastre as <b>técnicas</b> (nome e descrição). O nome não pode repetir.
            </>,
            <>
              Em <b>Material</b>, inclua uma linha por técnica: preço por m², fração mínima (m²) e folga (%, de 0 a 100).
            </>,
            <>
              Em <b>Mão de obra</b>, inclua uma linha por técnica com o valor unitário (por peça).
            </>,
          ]}
        />
        <ul>
          <li>Duplo clique numa linha também abre a alteração.</li>
          <li>Cada técnica aparece uma única vez em cada tabela.</li>
          <li>Técnica usada em Material ou Mão de obra não pode ser excluída (exclua a linha da tabela antes).</li>
          <li>Técnica sem as duas tabelas aparece no carrinho como “cadastro incompleto” e impede gerar o orçamento.</li>
        </ul>
        <Dica tipo="atencao">
          Fração mínima e folga grandes encarecem muito os pedidos pequenos. Veja os exemplos em{' '}
          <Menu>Ajuda › Memórias de cálculo › Folga e fração mínima</Menu>.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 22 */}
      <Secao id="man-usuarios" titulo="Usuários e acessos" numero={24}>
        <h4>Usuários</h4>
        <ul>
          <li>Inclua com nome, login e senha inicial. O login não pode ser alterado nem reaproveitado.</li>
          <li>Altere nome ou senha a qualquer momento.</li>
          <li>
            Ninguém é apagado: <b>inative</b> quem saiu (não entra mais, mas continua como responsável pelo que fez) e{' '}
            <b>reative</b> se voltar (com os mesmos acessos). Ninguém inativa o próprio usuário.
          </li>
        </ul>
        <h4>Acessos</h4>
        <ul>
          <li>
            Marque as telas que cada usuário pode usar. O menu mostra só as liberadas e o sistema bloqueia as demais funções.
          </li>
          <li>Sempre resta pelo menos um usuário com acesso à tela Acessos.</li>
          <li>
            Telas novas são liberadas automaticamente a quem administra os acessos; as telas de Ajuda, a todos os usuários ativos.
          </li>
        </ul>
        <Dica>
          Todos os usuários veem todos os orçamentos e pedidos. O filtro <Bt>Somente os meus</Bt> mostra só os criados por você.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 23 */}
      <Secao id="man-atualizacao" titulo="Atualização de produtos" numero={25}>
        <Passos
          itens={[
            <>
              Abra <Menu>Sistema › Atualização</Menu>.
            </>,
            'Marque os fornecedores (Asia, So Marcas, Spot, XBZ).',
            <>
              Clique em <Bt>Atualizar agora</Bt> e acompanhe o log em tempo real.
            </>,
          ]}
        />
        <p>
          A atualização traz preço, estoque, fotos, descrição, ficha técnica e categorias. Também pode ser agendada no servidor
          para rodar todos os dias. Orçamentos já gerados guardam o custo da época e não mudam.
        </p>
      </Secao>

      {/* ─────────────────────────────── Backup */}
      <Secao id="man-backup" titulo="Backup da base" numero={26}>
        <p>
          Todo dia, de madrugada (03:00), o servidor faz sozinho uma cópia da base de dados, confere se ela está íntegra e guarda
          as dos últimos 7 dias, apagando as mais antigas. O sistema continua no ar durante a cópia. Só depois que a cópia do dia
          passa na conferência as antigas são apagadas: se um backup falhar, nada antigo se perde.
        </p>
        <ul>
          <li>
            Em <Menu>Sistema › Atualização</Menu>, o cartão <i>Backup da base</i> mostra o último backup, as cópias guardadas e a
            cópia fora do servidor (Google Drive), quando configurada.
          </li>
          <li>
            O cartão fica em <b>vermelho</b> se o último backup falhou, se a cópia externa falhou ou se não houve backup nas
            últimas 26 horas. Nesse caso, avise quem cuida do servidor.
          </li>
          <li>
            Entra no backup só a base de dados (cadastros, orçamentos, pedidos, comissões, parâmetros e a cena de cada mockup). As
            imagens prontas dos mockups e as fotos baixadas ficam em outra pasta e não entram.
          </li>
        </ul>
        <h4>Restaurar um backup (no servidor)</h4>
        <Passos
          itens={[
            <>
              Pare o sistema: <code>pm2 stop all</code>.
            </>,
            <>
              Veja as cópias: <code>npm run restaurar</code>.
            </>,
            <>
              Restaure a escolhida: <code>npm run restaurar -- produtos-AAAA-MM-DD_0300.db.gz</code> e digite SIM. A base atual
              fica guardada ao lado (<code>produtos.db.antes-restauracao-….bak</code>).
            </>,
            <>
              Ligue de novo: <code>pm2 start raizes</code> (e <code>pm2 start raizes-atualizar</code>, se estava ligado).
            </>,
          ]}
        />
        <Dica tipo="atencao">
          Restaurar volta a base inteira para o momento do backup: o que foi gravado depois (orçamentos, pedidos, clientes) se
          perde.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 24 */}
      <Secao id="man-kommo" titulo="Integração com o Kommo" numero={27}>
        <Dica tipo="atencao">
          A integração está <b>desligada</b>: os clientes ficam no cadastro do próprio sistema (<Menu>Cadastros › Clientes</Menu>
          ). Os clientes criados a partir dos orçamentos antigos guardam o código do contato no Kommo só como referência.
        </Dica>
        <p>Se a integração for religada no servidor (variável KOMMO_ATIVO=1, com subdomínio e token):</p>
        <ul>
          <li>
            Em <Menu>Sistema › Atualização</Menu>, o cartão <i>Clientes do Kommo</i> mostra a cópia dos contatos e a última
            sincronização.
          </li>
          <li>
            Envio do orçamento, aceite, recusa e pedido gerado viram notas no contato do Kommo dos clientes que têm esse código.
            Podem ser desligadas em <Menu>Parâmetros › Sistema</Menu>.
          </li>
        </ul>
      </Secao>

      {/* ─────────────────────────────── 25 */}
      <Secao id="man-problemas" titulo="Problemas comuns" numero={28}>
        <Tabela
          colunas={['Situação', 'Causa e solução']}
          linhas={[
            [
              'Não consigo editar o orçamento',
              'Ele não está Aberto. Se estiver Enviado, use ↩ Voltar para aberto. Com pedido gerado, cancele o pedido primeiro. O carrinho também precisa estar vazio.',
            ],
            [
              '“Personalização incompleta” ao gerar',
              'Algum item tem técnica sem cadastro em Material/Mão de obra ou arte sem altura e largura. A mensagem lista os itens.',
            ],
            [
              'Não consigo enviar para o cliente',
              'O orçamento precisa de cliente vinculado: edite e escolha (ou inclua) o cliente no carrinho.',
            ],
            [
              'O cliente diz que o link não abre',
              'O link pode ter sido trocado (Gerar novo link) ou o orçamento voltou para Aberto. Envie de novo.',
            ],
            [
              'O cliente não consegue aceitar',
              'O link venceu (7 dias) ou o cliente já respondeu. Volte para aberto e reenvie para renovar a validade.',
            ],
            ['Não aparece o botão de mockup', 'Mockups só com o orçamento Aberto.'],
            [
              'Cliente não aparece na busca',
              'Ele pode estar inativo ou ter sido mesclado em outro cadastro: confira em Cadastros › Clientes (filtro Mostrar: Todos).',
            ],
            [
              'Preço muito alto em pedido pequeno',
              'Custos fixos (designer + logística) divididos por poucas peças, ou fração mínima grande na técnica. Ajuste no item ou nas tabelas.',
            ],
            [
              'Não vejo uma tela no menu',
              'Ela não está liberada para o seu usuário. Peça a liberação a quem administra os Acessos.',
            ],
            [
              'Fui desconectado',
              'A sessão expira após 12 horas sem uso ou quando a senha é trocada em outro lugar. Entre de novo.',
            ],
          ]}
        />
      </Secao>

      {/* ─────────────────────────────── 26 */}
      <Secao id="man-glossario" titulo="Glossário" numero={29}>
        <Tabela
          colunas={['Termo', 'Significado']}
          linhas={[
            ['ORC-0001', 'Número do orçamento.'],
            ['PED-000001', 'Código do pedido.'],
            ['PDP-000001', 'Código de produto próprio.'],
            ['Custo do fornecedor', 'Preço que pagamos ao fornecedor por unidade.'],
            ['Técnica', 'Forma de personalização (Sublimação, DTF UV, Laser…), cadastrada em Tabelas gerais.'],
            ['Fração mínima', 'Menor quantidade de material que se usa/compra, em m².'],
            ['Folga', 'Percentual de sobra de material para perdas e acertos.'],
            ['Rateio', 'Divisão de um valor entre itens (material somado por técnica; custos fixos entre as peças).'],
            ['Custos fixos', 'Designer/mockup e logística: valores por pedido, divididos pela quantidade.'],
            ['Margem real', 'Quanto do preço de venda sobra como lucro, depois do custo e do imposto sobre venda.'],
            ['Ajustado', 'Item cujo material ou mão de obra foi alterado pelo operador em relação ao sugerido.'],
            ['Link do cliente', 'Endereço secreto do orçamento para o cliente ver, aceitar ou rejeitar.'],
            ['Mockup', 'Imagem do produto com a logo do cliente.'],
            ['SLA', 'Tempo em cada etapa do pedido, medido pelas movimentações.'],
          ]}
        />
      </Secao>
    </TelaAjuda>
  );
}
