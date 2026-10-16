// Conteúdo editorial de suporte. Não promete aprovação de reembolso,
// disponibilidade instantânea de atendentes ou recursos ainda não confirmados.
export const SUPPORT_TOPICS = [
  { id: "all", label: "Todos", icon: "fa-solid fa-layer-group" },
  { id: "tickets", label: "Ingressos", icon: "fa-solid fa-ticket" },
  { id: "payments", label: "Pagamentos", icon: "fa-solid fa-credit-card" },
  { id: "producers", label: "Produções", icon: "fa-solid fa-building" },
  { id: "account", label: "Minha conta", icon: "fa-regular fa-user" },
];

export const SUPPORT_FAQS = [
  {
    id: "ticket-location", topic: "tickets", category: "Ingressos",
    question: "Onde encontro meus ingressos e o QR Code?",
    answer: "Entre na sua conta e abra Meus ingressos. Ali você pode consultar os ingressos vinculados à sua conta e visualizar as informações disponíveis para apresentação na entrada do evento. Se não aparecer, confira a conta utilizada na compra e abra um chamado informando o pedido.",
  },
  {
    id: "ticket-transfer", topic: "tickets", category: "Ingressos",
    question: "Comprei um ingresso. Posso transferi-lo para outra pessoa?",
    answer: "As regras de transferência podem variar conforme o ingresso e o evento. Consulte as condições informadas na página do evento e nos detalhes da compra. Se não encontrar a opção ou houver dúvidas, abra um chamado antes de compartilhar dados do ingresso.",
  },
  {
    id: "pix-pending", topic: "payments", category: "Pagamentos",
    question: "Meu pagamento PIX continua pendente. O que fazer?",
    answer: "Acesse Minhas compras e confira o status do pedido. Aguarde a confirmação do pagamento antes de tentar outra compra. Se o pagamento foi debitado e o pedido não atualizou, abra um chamado com a identificação do pedido e o horário aproximado do pagamento. Não informe senha ou código de autenticação.",
  },
  {
    id: "refund", topic: "payments", category: "Pagamentos",
    question: "Como solicito análise de cancelamento ou reembolso?",
    answer: "Abra um chamado na categoria Compra, pagamento ou reembolso, identificando a compra e o motivo. A equipe analisará as regras aplicáveis, a situação do ingresso e as condições do evento. A abertura do chamado não representa aprovação automática do reembolso.",
  },
  {
    id: "create-production", topic: "producers", category: "Produções",
    question: "Como cadastrar uma produção e começar a divulgar eventos?",
    answer: "Crie uma conta na Cutinapp, siga o fluxo de cadastro de produtor e preencha os dados da produção. Depois, organize os eventos e as informações de ingressos. Para dúvidas sobre configuração e publicação, utilize o formulário de suporte.",
  },
  {
    id: "claim-page", topic: "producers", category: "Produções",
    question: "Encontrei minha produção ou meu perfil de artista. Como reivindicar a página?",
    answer: "Entre ou cadastre-se na Cutinapp e procure a opção Reivindicar página no perfil público, quando disponível. A titularidade deve ser verificada antes da liberação do acesso de edição. Se a opção não aparecer, abra um chamado com o endereço da página e a identificação profissional.",
  },
  {
    id: "event-help", topic: "producers", category: "Produções",
    question: "Preciso de ajuda com vendas, check-in ou publicação de eventos.",
    answer: "Descreva o evento, a etapa em que ocorreu o problema e a mensagem exibida. Informe quando aconteceu e inclua o endereço público do evento, se houver. A equipe pode orientar sobre configuração de ingressos, operação do check-in e uso das ferramentas de gestão.",
  },
  {
    id: "account-access", topic: "account", category: "Minha conta",
    question: "Não consigo entrar na minha conta. Como recupero o acesso?",
    answer: "Na tela de login, utilize a recuperação de senha para o e-mail cadastrado. Se o problema continuar, abra um chamado e informe o e-mail de cadastro, sem compartilhar senhas, códigos de verificação ou tokens de acesso.",
  },
  {
    id: "contact", topic: "account", category: "Minha conta",
    question: "Como falar com uma pessoa da equipe da Cutinapp?",
    answer: "Você pode entrar em contato pelo WhatsApp oficial, quando configurado, enviar um e-mail ou abrir um chamado nesta página. As solicitações são recebidas pela estrutura de atendimento da Peter Tecnet. O tempo de resposta pode variar conforme o canal e a demanda.",
  },
];

export const normalizeSupportText = (value) => String(value || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const filterSupportFaqs = (query, topic = "all") => {
  const needle = normalizeSupportText(query);
  return SUPPORT_FAQS.filter((entry) =>
    (topic === "all" || entry.topic === topic)
    && (!needle || normalizeSupportText(`${entry.question} ${entry.answer} ${entry.category}`).includes(needle))
  );
};
