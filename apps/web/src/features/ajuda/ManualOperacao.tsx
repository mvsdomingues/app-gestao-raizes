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
  { id: 'man-proprios', titulo: 'Produtos próprios' },
  { id: 'man-parametros', titulo: 'Parâmetros' },
  { id: 'man-tabelas', titulo: 'Tabelas gerais' },
  { id: 'man-usuarios', titulo: 'Usuários e acessos' },
  { id: 'man-atualizacao', titulo: 'Atualização de produtos' },
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
              No primeiro acesso de um usuário criado pelo administrador, troque a senha em <Bt>ícone do usuário</Bt> (canto superior
              direito) › <Bt>Meus dados</Bt>. Enquanto a senha inicial não for trocada, o sistema mostra um aviso.
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
          O menu fica na barra lateral, em grupos: <b>Dashboards</b>, <b>Vendas</b>, <b>Cadastros</b>, <b>Sistema</b> e <b>Ajuda</b>.
          Cada usuário vê só as telas liberadas para ele. O botão <Bt>Recolher menu</Bt>, no rodapé da barra, deixa só os ícones (a
          escolha fica guardada no navegador). O número ao lado de <b>Carrinho</b> mostra quantos produtos estão nele.
        </p>
        <Dica>
          Todas as mensagens e confirmações do sistema aparecem em janelas próprias. Leia antes de confirmar: ações como cancelar ou
          gerar pedido ficam registradas no histórico com o seu nome.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 2 */}
      <Secao id="man-fluxo" titulo="O fluxo de uma venda, do começo ao fim" numero={2}>
        <div className="ajuda-fluxo vertical">
          {[
            ['Catálogo', 'Encontre os produtos e coloque no carrinho.'],
            ['Carrinho', 'Quantidades, técnica e tamanho da arte, cliente, faturamento, entrega e frete. O preço é calculado na hora.'],
            ['Gerar Orçamento', 'Grava o orçamento (ORC-0001…) na situação Aberto.'],
            ['Mockups (opcional)', 'Com o orçamento Aberto, monte a imagem de cada produto com a logo do cliente.'],
            ['Enviar para o cliente', 'Gera o link secreto; envie por WhatsApp ou copie. O orçamento fica Enviado.'],
            ['Cliente aceita', 'Pelo link, o cliente completa os dados de faturamento e aceita: o pedido (PED-000001…) nasce na hora.'],
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
          Reúne os produtos de todos os fornecedores integrados (Asia Import, So Marcas, Spot Gifts, XBZ) e os produtos próprios da
          empresa. <Ir tela="catalogo">Abrir o Catálogo</Ir>
        </p>
        <h4>Buscar</h4>
        <ul>
          <li>
            Digite nome, código ou parte da descrição. <b>Cada palavra</b> digitada precisa aparecer no produto (ex.: “caneca azul 400”).
          </li>
          <li>
            Filtros: <b>fornecedor</b>, <b>categoria</b>, <b>cor</b> (as grafias de cada fornecedor são unificadas: “AZUL” e “Azul” são a
            mesma cor) e <b>estoque</b>.
          </li>
          <li>
            <b>Faixa de preço</b>: faixas prontas (até R$ 5 … acima de R$ 200) ou mínimo e máximo digitados. Produtos sem preço ficam fora
            das faixas.
          </li>
          <li>
            <b>Ordenação</b>: por fornecedor (padrão, agrupado), menor preço, maior preço ou nome. Ordenando por preço ou nome, a lista
            deixa de ser agrupada por fornecedor; produtos sem preço vão para o fim.
          </li>
          <li>Alterne entre visualização em <b>grade</b> ou <b>lista</b>.</li>
        </ul>
        <h4>Detalhes do produto</h4>
        <p>
          O botão <Bt>i</Bt> do cartão abre os detalhes: galeria de fotos, descrição, ficha técnica (material, medidas, peso,
          capacidade, personalização, embalagem, NCM…), vídeo e, nos produtos da So Marcas, o custo por quantidade. Clicar numa
          categoria ou na cor aplica o filtro.
        </p>
        <h4>Colocar no carrinho</h4>
        <p>
          Clique no botão de adicionar do cartão. O produto entra com 1 unidade; quantidade e personalização são definidas no carrinho.
        </p>
        <Dica tipo="regra">
          Para o cliente vão apenas o resumo da descrição (até ~200 caracteres), as medidas e o material. Fornecedor, marca, custo e tipo
          de gravação nunca aparecem na folha nem no link.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 4 */}
      <Secao id="man-carrinho" titulo="Carrinho" numero={4}>
        <p>
          É onde o orçamento é montado. Cada item mostra a foto, o nome, o código, o fornecedor e o custo do fornecedor, além do preço de
          venda calculado. <Ir tela="carrinho">Abrir o Carrinho</Ir>
        </p>
        <h4>Em cada item</h4>
        <Tabela
          colunas={['Campo', 'Como usar']}
          linhas={[
            ['Quantidade', 'Botões − e + ou digite e tecle Enter. Ao lado aparece a faixa (pedido pequeno, médio volume…).'],
            ['Observação do produto', 'Cor, posição do logo, gravação… Vai para a folha e para o cliente.'],
            ['Técnica de personalização', 'Escolha a técnica; veja a seção “Personalização no carrinho”.'],
            ['Preço de venda calculado', 'Preço por unidade, com a faixa, o custo total/un e a margem real.'],
            [<Bt key="b">✕</Bt>, 'Remove o item.'],
          ]}
        />
        <h4>No resumo (lado direito)</h4>
        <ul>
          <li>
            <b>Cliente</b> (com o Kommo ligado), <b>Frete</b>, <b>Custos fixos do orçamento</b>, <b>Previsão de entrega</b>,{' '}
            <b>Faturamento e entrega</b> e <b>Observações</b> gerais do orçamento.
          </li>
          <li>
            <b>Custos fixos do orçamento</b>: designer/mockup e logística, cobrados <b>uma vez</b> no orçamento e divididos pelo total de
            peças (a linha abaixo mostra o valor por peça). Começam com os valores de Parâmetros; altere se este orçamento tiver outro
            custo. <Bt>Voltar ao padrão</Bt> desfaz.
          </li>
          <li>Subtotal (soma dos itens), frete e total.</li>
          <li>
            <Bt>Gerar Orçamento</Bt> (ou <Bt>Salvar ORC-…</Bt> quando você está alterando um orçamento) e <Bt>Limpar carrinho</Bt>.
          </li>
        </ul>
        <Dica tipo="regra">
          Imposto de compra, imposto sobre venda e margem não aparecem no carrinho: valem sempre os cadastrados em Parâmetros. As contas
          completas estão em <Menu>Ajuda › Memórias de cálculo</Menu>.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 5 */}
      <Secao id="man-personalizacao" titulo="Personalização no carrinho (técnica, arte, material e mão de obra)" numero={5}>
        <Passos
          itens={[
            <>
              Em <Bt>Técnica de personalização</Bt>, escolha a técnica do item (uma por item). Técnicas marcadas como “cadastro incompleto”
              ainda não têm valor na tabela Material ou Mão de obra.
            </>,
            <>
              Informe <Bt>Altura da arte (cm)</Bt> e <Bt>Largura da arte (cm)</Bt> — o tamanho da área personalizada em cada peça.
            </>,
            <>
              Confira o <b>material sugerido</b> (m², frações, folga e valor) e a <b>mão de obra</b>. Quando outros itens usam a mesma
              técnica, aparece o quadro roxo com o material somado do orçamento e a parte deste item.
            </>,
            <>
              Se precisar, altere <Bt>Material (m²)</Bt>, <Bt>Material (R$ total)</Bt> ou <Bt>Mão de obra (R$/un)</Bt>. O item ganha o
              selo <b>MATERIAL AJUSTADO</b> / <b>MÃO DE OBRA AJUSTADA</b>; <Bt>Voltar ao sugerido</Bt> desfaz.
            </>,
          ]}
        />
        <h4>Sem técnica</h4>
        <p>
          Deixe <Bt>Sem personalização (valores digitados)</Bt>: o material (R$ total do lote) e a mão de obra (R$/un) começam com os
          valores padrão de <Menu>Parâmetros › Precificação</Menu> e podem ser alterados — inclusive para zero. <Bt>Voltar ao padrão</Bt>{' '}
          desfaz.
        </p>
        <Dica tipo="atencao">
          O orçamento <b>não é gerado</b> enquanto algum item tiver técnica sem cadastro completo ou arte sem medida. A mensagem lista os
          itens e o que corrigir (ex.: “Cadastre a técnica "Laser" na tabela Mão de obra”). A correção do cadastro é feita em{' '}
          <Menu>Parâmetros › Tabelas gerais</Menu>; ao voltar ao carrinho, as tabelas são relidas.
        </Dica>
        <Dica>
          A técnica e as medidas da arte aparecem para o cliente (link e impressão) na linha <i>Personalização</i> do produto — sem
          valores nem quantidade de material. O material usado e os ajustes ficam só na tela interna (linha laranja <i>Interno</i>).
          Ao editar o orçamento, tudo volta para o carrinho como estava.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 6 */}
      <Secao id="man-cliente" titulo="Cliente, faturamento e previsão de entrega" numero={6}>
        <h4>Cliente (Kommo)</h4>
        <p>
          Com a integração do Kommo ligada, o campo <b>Cliente</b> tem uma busca única que reconhece o que foi digitado: telefone (qualquer
          formato, com ou sem +55), parte do nome (sem acento), e-mail ou <b>#código</b> do Kommo. Use as setas e Enter para escolher.
          A lista mostra telefones, código, data de criação, quantos orçamentos o cliente tem e o aviso <i>telefone repetido</i>.
        </p>
        <ul>
          <li>
            Não achou (contato criado há poucos minutos)? <Bt>Buscar direto no Kommo</Bt>.
          </li>
          <li>
            Cliente escolhido: <Bt>Abrir no Kommo</Bt>, <Bt>Trocar</Bt> e <Bt>Remover</Bt>.
          </li>
          <li>O cliente é opcional para gerar o orçamento e obrigatório para enviá-lo.</li>
          <li>O sistema nunca cria contatos no Kommo: cadastre o contato lá primeiro.</li>
        </ul>
        <h4>Faturamento e entrega</h4>
        <Passos
          itens={[
            <>
              Em <b>Faturamento e entrega</b>, clique em <Bt>+ Informar</Bt>.
            </>,
            'Escolha Empresa (CNPJ) ou Pessoa física (CPF) e preencha nome/razão social, contato (opcional, só empresa), e-mail e documento.',
            'Digite o CEP: o endereço é completado automaticamente; complete número e complemento.',
            <>
              <Bt>Usar no orçamento</Bt>.
            </>,
          ]}
        />
        <p>
          No orçamento esses dados são <b>opcionais</b> (só o que foi digitado é conferido: CPF/CNPJ com dígito verificador, e-mail e CEP).
          No aceite pelo link eles passam a ser <b>obrigatórios</b> para o cliente. Aparecem no início da folha impressa.
        </p>
        <h4>Previsão de entrega e frete</h4>
        <p>
          A <b>previsão de entrega</b> vai para a folha, para o link do cliente e passa para o pedido (base do calendário e dos atrasos).
          O <b>frete</b> é somado ao total, sem margem.
        </p>
      </Secao>

      {/* ─────────────────────────────── 7 */}
      <Secao id="man-gerar" titulo="Gerar e alterar orçamentos" numero={7}>
        <h4>Gerar</h4>
        <p>
          <Bt>Gerar Orçamento</Bt> grava o orçamento com o próximo número (ORC-0001, ORC-0002…), esvazia o carrinho e abre os detalhes. O
          orçamento nasce <b>Aberto</b> e guarda você como responsável.
        </p>
        <h4>Alterar</h4>
        <Passos
          itens={[
            <>
              O orçamento precisa estar <b>Aberto</b>. Se estiver Enviado, use <Bt>↩ Voltar para aberto</Bt> nos detalhes.
            </>,
            'O carrinho precisa estar vazio.',
            <>
              Clique em <Bt>✎ Editar</Bt> (na lista ou nos detalhes): os itens, quantidades, personalização, cliente, faturamento, frete,
              observações e previsão voltam ao carrinho.
            </>,
            <>
              Faça as mudanças e clique em <Bt>Salvar ORC-…</Bt>. O número continua o mesmo e a data da alteração e o usuário que alterou
              ficam registrados. Não há limite de alterações.
            </>,
          ]}
        />
        <Dica>
          Desistiu? <Bt>Limpar carrinho</Bt> sai da alteração sem modificar o orçamento salvo. Mockups acompanham o produto; o mockup de um
          produto removido é apagado.
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
            Filtros: número (<i>ORC-0005</i> ou <i>5</i>), produto (descrição ou código de qualquer item), cliente, período, faixa de valor
            total, situação e <Bt>Somente os meus</Bt>.
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
            ['Aberto', 'Ao gerar; ao voltar de Enviado; ao reabrir um cancelado', 'Editar, criar mockups, enviar, gerar pedido, cancelar'],
            ['Enviado', 'Ao clicar em Enviar para o Cliente', 'Voltar para aberto, gerar pedido, cancelar, gerar novo link'],
            ['Pedido gerado', 'Automático ao gerar o pedido (pelo sistema ou pelo aceite do cliente)', 'Só consulta; o código PED-… é clicável'],
            ['Cancelado', 'Cancelamento manual (com motivo) ou recusa do cliente pelo link', 'Reabrir (volta para Aberto)'],
          ]}
        />
        <Dica tipo="regra">
          Só orçamento <b>Aberto</b> pode ser alterado. Orçamento com pedido gerado nunca é alterado nem cancelado — cancela-se o pedido, e
          o orçamento volta para a situação que tinha antes (Aberto ou Enviado). Toda mudança de situação fica no histórico.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 10 */}
      <Secao id="man-link" titulo="Enviar o orçamento ao cliente (link)" numero={10}>
        <Passos
          itens={[
            'Confira o orçamento (e, com o Kommo ligado, vincule o cliente — é obrigatório para enviar).',
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
            ['Kommo', 'Envio, aceite e recusa viram notas no contato (se ligado em Parâmetros › Sistema).'],
          ]}
        />
      </Secao>

      {/* ─────────────────────────────── 11 */}
      <Secao id="man-pagina-cliente" titulo="O que o cliente vê no link" numero={11}>
        <ul>
          <li>A mesma folha impressa: produtos, fotos, quantidades, preço unitário e total, frete, previsão de entrega e mockups.</li>
          <li>
            <b>Nunca</b>: custo, composição do preço, fornecedor, usuários ou dados internos.
          </li>
          <li>A técnica de personalização e as medidas da arte de cada produto (sem valores nem material).</li>
          <li>As instruções especiais de Parâmetros › Impressão, logo após os valores e mockups.</li>
          <li>Botão de imprimir/salvar PDF.</li>
          <li>
            <Bt>Aceitar orçamento</Bt>: abre o formulário de faturamento já preenchido com o que foi informado; o cliente completa os
            campos obrigatórios e confirma (observação opcional). O pedido é gerado na hora e a movimentação aparece como{' '}
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
          Imagem de cada produto com a logo do cliente. É opcional e só pode ser criada ou alterada com o orçamento <b>Aberto</b> (depois
          de enviado, fica para consulta; voltar para Aberto libera de novo). <Ir tela="mockup">Abrir Mockups</Ir>
        </p>
        <Passos
          itens={[
            <>
              Gere o orçamento. Nos detalhes, clique em <Bt>🎨 Mockups</Bt> (ou abra <Menu>Vendas › Mockups</Menu> e escolha um orçamento
              Aberto).
            </>,
            'Escolha o produto e a foto de fundo (galeria do fornecedor).',
            'Adicione uma ou várias logos (arquivo de imagem) e textos (fonte, cor, negrito, itálico).',
            'Posicione: arraste, gire e redimensione pelas alças. Guias aparecem no centro; setas do teclado movem com precisão; Delete remove.',
            'Ajuste mesclagem (multiplicar, normal, sobrepor, tela), acabamento (original, branco, preto, dourado), opacidade, curvatura (canecas, garrafas) e perspectiva.',
            'Organize as camadas (frente/trás, duplicar, remover). Ctrl+Z desfaz e Ctrl+Y refaz.',
            <>
              <Bt>Salvar no ORC-…</Bt> grava a imagem no item (a edição fica guardada para continuar depois). <Bt>Baixar PNG</Bt> baixa o
              arquivo.
            </>,
          ]}
        />
        <Dica>
          Os mockups aparecem na folha (tela, impressão, link do cliente e pedido) numa seção depois dos valores. Use logos em PNG com
          fundo transparente para o melhor resultado.
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
          Instruções especiais e rodapé são cadastrados em <Menu>Parâmetros › Impressão</Menu> e valem para todos os orçamentos, inclusive
          os já enviados.
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
              Nos detalhes do orçamento (Aberto ou Enviado), clique em <Bt>📦 Gerar pedido</Bt> — ou, em Pedidos, <Bt>+ Novo pedido</Bt> e
              escolha o orçamento.
            </>,
            'Informe uma observação, se quiser (vira o primeiro registro do histórico do pedido).',
            'Confirme. O orçamento passa para Pedido gerado e os dados de faturamento são copiados para o pedido.',
          ]}
        />
        <Tabela
          colunas={['Aba', 'Para que serve']}
          linhas={[
            ['Todos os pedidos', 'Lista paginada com filtros por código, orçamento, cliente, situação (inclui “Em andamento”), período e Somente os meus.'],
            ['Quadro', 'Kanban por etapa, para mover os pedidos no dia a dia.'],
            ['Calendário', 'Entregas previstas por semana ou mês (só consulta).'],
            ['Detalhes', 'Tudo sobre um pedido: etapas, checklist, observações, faturamento e itens.'],
          ]}
        />
        <Dica tipo="regra">
          Pedidos não são editados. Se algo estiver errado, <Bt>Cancelar pedido</Bt> (com motivo): o orçamento fica livre para ser
          corrigido e gerar outro pedido. Nunca há dois pedidos ativos para o mesmo orçamento; pedido encerrado não pode ser cancelado.
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
          Ao entrar em <b>Em Fechamento</b>, o pedido recebe a lista de <Menu>Parâmetros › Checklist de fechamento</Menu>. Marque cada item
          nos detalhes (grava data, hora e usuário). Só pode ser marcado nessa etapa e não trava o fluxo: o pedido avança mesmo com itens
          em aberto. O cartão do Quadro mostra o progresso (☑ 2/3).
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
          <li>Pedidos sem data ficam numa lista abaixo. Clique no cartão para abrir os detalhes; nada é movimentado no calendário.</li>
        </ul>
      </Secao>

      {/* ─────────────────────────────── 17 */}
      <Secao id="man-pedido-detalhe" titulo="Detalhes do pedido" numero={17}>
        <Tabela
          colunas={['Bloco', 'O que faz']}
          linhas={[
            ['Etapas', 'Data e hora de cada etapa, tempo total e tempo em cada etapa.'],
            ['Entrega prevista', 'Pode ser alterada só na etapa Criado; cada mudança vira uma observação (“alterada de … para …”).'],
            ['Faturamento e entrega', <span key="f">Alterável com o pedido em andamento (<Bt>Alterar dados</Bt>); cada mudança vira observação com o antes → depois.</span>],
            ['Checklist', 'Itens de fechamento (marcáveis em Em Fechamento).'],
            ['Observações', <span key="o">Linha do tempo (mais recente no topo). <Bt>+ Incluir observação</Bt> em qualquer situação; registros não são editados nem apagados. A caixa mostra 10 linhas e rola.</span>],
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
            <b>Período</b>: hoje, 7/30/90 dias, este mês, mês anterior, este ano ou datas personalizadas. <b>Vendedor</b>: todos ou um
            usuário.
          </li>
          <li>Cartões com os principais números e a variação em relação ao período anterior de mesma duração.</li>
          <li>Gráficos: evolução no tempo, funil, situação dos orçamentos, etapas dos pedidos, produtos, fornecedores e vendedores.</li>
          <li>
            Passe o mouse para ver os valores; <Bt>Ver tabela</Bt> mostra os números de cada gráfico.
          </li>
        </ul>
        <Dica>
          Como cada indicador é calculado: <Menu>Ajuda › Memórias de cálculo › Indicadores dos dashboards</Menu>.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 19 */}
      <Secao id="man-proprios" titulo="Produtos próprios" numero={19}>
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
      <Secao id="man-parametros" titulo="Parâmetros" numero={20}>
        <p>
          Configurações que afetam preços, pedidos e impressão. <Ir tela="parametros">Abrir Parâmetros</Ir>
        </p>
        <Tabela
          colunas={['Aba', 'O que configura']}
          linhas={[
            [
              'Precificação',
              'Material e mão de obra padrão dos itens sem técnica, imposto de compra (e se é aplicado), designer e logística (padrão de cada orçamento), imposto sobre venda e margem. Mostra uma simulação ao lado. Vale para os próximos cálculos do carrinho (orçamentos já gerados não mudam).',
            ],
            ['Tabelas gerais', 'Técnicas de personalização, Material por técnica e Mão de obra por técnica.'],
            ['Checklist de fechamento', 'Itens da lista usada em Em Fechamento (incluir, renomear, reordenar, remover). Vale para os próximos pedidos.'],
            ['Impressão', 'Instruções especiais (só na impressão/PDF) e rodapé.'],
            ['Sistema', 'Enviar notas para o Kommo (ligado/desligado).'],
          ]}
        />
      </Secao>

      {/* ─────────────────────────────── 21 */}
      <Secao id="man-tabelas" titulo="Tabelas gerais de precificação" numero={21}>
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
      <Secao id="man-usuarios" titulo="Usuários e acessos" numero={22}>
        <h4>Usuários</h4>
        <ul>
          <li>Inclua com nome, login e senha inicial. O login não pode ser alterado nem reaproveitado.</li>
          <li>Altere nome ou senha a qualquer momento.</li>
          <li>
            Ninguém é apagado: <b>inative</b> quem saiu (não entra mais, mas continua como responsável pelo que fez) e <b>reative</b> se
            voltar (com os mesmos acessos). Ninguém inativa o próprio usuário.
          </li>
        </ul>
        <h4>Acessos</h4>
        <ul>
          <li>Marque as telas que cada usuário pode usar. O menu mostra só as liberadas e o sistema bloqueia as demais funções.</li>
          <li>Sempre resta pelo menos um usuário com acesso à tela Acessos.</li>
          <li>Telas novas são liberadas automaticamente a quem administra os acessos; as telas de Ajuda, a todos os usuários ativos.</li>
        </ul>
        <Dica>
          Todos os usuários veem todos os orçamentos e pedidos. O filtro <Bt>Somente os meus</Bt> mostra só os criados por você.
        </Dica>
      </Secao>

      {/* ─────────────────────────────── 23 */}
      <Secao id="man-atualizacao" titulo="Atualização de produtos" numero={23}>
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
          A atualização traz preço, estoque, fotos, descrição, ficha técnica e categorias. Também pode ser agendada no servidor para rodar
          todos os dias. Orçamentos já gerados guardam o custo da época e não mudam.
        </p>
      </Secao>

      {/* ─────────────────────────────── 24 */}
      <Secao id="man-kommo" titulo="Integração com o Kommo" numero={24}>
        <ul>
          <li>Os contatos do Kommo são copiados para o sistema e atualizados a cada poucos minutos; uma vez por dia, de madrugada, é feita a conferência completa.</li>
          <li>
            Em <Menu>Sistema › Atualização</Menu>, o cartão <i>Clientes do Kommo</i> mostra o total e a última sincronização, com{' '}
            <Bt>Sincronizar clientes agora</Bt> e <Bt>Conferência completa</Bt>.
          </li>
          <li>
            Notas no contato: envio do orçamento (com o link), aceite, recusa e pedido gerado. Se o Kommo estiver fora do ar, a nota fica
            na fila e é reenviada. Podem ser desligadas em <Menu>Parâmetros › Sistema</Menu>.
          </li>
        </ul>
      </Secao>

      {/* ─────────────────────────────── 25 */}
      <Secao id="man-problemas" titulo="Problemas comuns" numero={25}>
        <Tabela
          colunas={['Situação', 'Causa e solução']}
          linhas={[
            ['Não consigo editar o orçamento', 'Ele não está Aberto. Se estiver Enviado, use ↩ Voltar para aberto. Com pedido gerado, cancele o pedido primeiro. O carrinho também precisa estar vazio.'],
            ['“Personalização incompleta” ao gerar', 'Algum item tem técnica sem cadastro em Material/Mão de obra ou arte sem altura e largura. A mensagem lista os itens.'],
            ['Não consigo enviar para o cliente', 'Com o Kommo ligado, o orçamento precisa de cliente vinculado: edite e escolha o cliente.'],
            ['O cliente diz que o link não abre', 'O link pode ter sido trocado (Gerar novo link) ou o orçamento voltou para Aberto. Envie de novo.'],
            ['O cliente não consegue aceitar', 'O link venceu (7 dias) ou o cliente já respondeu. Volte para aberto e reenvie para renovar a validade.'],
            ['Não aparece o botão de mockup', 'Mockups só com o orçamento Aberto.'],
            ['Cliente não aparece na busca', 'Contato recém-criado no Kommo: use Buscar direto no Kommo.'],
            ['Preço muito alto em pedido pequeno', 'Custos fixos (designer + logística) divididos por poucas peças, ou fração mínima grande na técnica. Ajuste os custos fixos no resumo do carrinho ou a técnica nas tabelas.'],
            ['Não vejo uma tela no menu', 'Ela não está liberada para o seu usuário. Peça a liberação a quem administra os Acessos.'],
            ['Fui desconectado', 'A sessão expira após 12 horas sem uso ou quando a senha é trocada em outro lugar. Entre de novo.'],
          ]}
        />
      </Secao>

      {/* ─────────────────────────────── 26 */}
      <Secao id="man-glossario" titulo="Glossário" numero={26}>
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
            ['Custos fixos', 'Designer/mockup e logística: valores do orçamento inteiro, cobrados uma vez e divididos pelo total de peças.'],
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
