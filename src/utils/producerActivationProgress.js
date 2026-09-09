import { sellableTicketCount } from "./eventSalesReadiness";

const normalizeRows = (value) => (Array.isArray(value) ? value : []);

const firstByDate = (events) => [...events].sort((left, right) => {
  const leftDate = new Date(left?.start_date || 0).getTime();
  const rightDate = new Date(right?.start_date || 0).getTime();
  return leftDate - rightDate;
})[0] || null;

const productionIdFor = (production) => Number(production?.id || 0);
const eventIdFor = (event) => Number(event?.id || 0);
export const producerActivationNextStep = ({ productions, events } = {}) => {
  const productionRows = normalizeRows(productions);
  const eventRows = normalizeRows(events).filter((event) => !event?.is_cancelled);

  if (productionRows.length === 0) {
    return {
      stage: "event",
      label: "Criar primeiro evento",
      description: "Comece pelo evento. Se ainda não tiver produção, crie o nome dela sem sair do cadastro e siga direto para o primeiro lote.",
      route: "/event/create",
    };
  }

  if (eventRows.length === 0) {
    const productionId = productionRows.length === 1 ? productionIdFor(productionRows[0]) : 0;
    return {
      stage: "event",
      label: "Criar primeiro evento",
      description: "Sua produção já existe. Agora cadastre o evento que vai receber as primeiras vendas.",
      route: productionId ? `/event/create?productionId=${productionId}` : "/event/create",
    };
  }

  const withoutTickets = firstByDate(eventRows.filter((event) => Number(event?.tickets_count || 0) <= 0));
  if (withoutTickets && eventIdFor(withoutTickets)) {
    return {
      stage: "ticket",
      label: "Criar primeiro lote",
      description: `Configure os ingressos de ${withoutTickets.title || "seu evento"} para liberar a publicação.`,
      route: `/ticket/create?eventId=${eventIdFor(withoutTickets)}`,
      eventId: eventIdFor(withoutTickets),
    };
  }

  const withoutSellableTickets = firstByDate(eventRows.filter((event) => Number(event?.tickets_count || 0) > 0 && sellableTicketCount(event) <= 0));
  if (withoutSellableTickets && eventIdFor(withoutSellableTickets)) {
    return {
      stage: "ticket",
      label: "Revisar ingressos para vender",
      description: `${withoutSellableTickets.title || "Seu evento"} tem lote cadastrado, mas nenhum ingresso está disponível para novas vendas.`,
      route: `/ticket/create?eventId=${eventIdFor(withoutSellableTickets)}`,
      eventId: eventIdFor(withoutSellableTickets),
    };
  }

  const unpublished = firstByDate(eventRows.filter((event) => !event?.is_published && sellableTicketCount(event) > 0));
  if (unpublished && eventIdFor(unpublished)) {
    return {
      stage: "publish",
      label: "Publicar e começar a vender",
      description: `${unpublished.title || "Seu evento"} já tem ingresso disponível. Falta colocá-lo no ar.`,
      route: `/event/edit/${eventIdFor(unpublished)}?activation=first-ticket&eventId=${eventIdFor(unpublished)}`,
      eventId: eventIdFor(unpublished),
    };
  }

  const published = firstByDate(eventRows.filter((event) => event?.is_published && sellableTicketCount(event) > 0));
  if (published && eventIdFor(published)) {
    return {
      stage: "first_sale",
      label: "Divulgar para a primeira venda",
      description: `${published.title || "Seu evento"} já está no ar. Compartilhe a página de vendas para buscar a primeira compra.`,
      route: `/event/edit/${eventIdFor(published)}?activation=first-ticket&eventId=${eventIdFor(published)}`,
      eventId: eventIdFor(published),
    };
  }

  return {
    stage: "selling",
    label: "Gerenciar eventos",
    description: "Seus eventos ativos estão prontos para divulgação e vendas.",
    route: "/event/manage",
  };
};
