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
      stage: "production",
      label: "Criar produção",
      description: "Comece com o nome da produção e siga direto para o primeiro evento.",
      route: "/production/create",
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

  const unpublished = firstByDate(eventRows.filter((event) => !event?.is_published));
  if (unpublished && eventIdFor(unpublished)) {
    return {
      stage: "publish",
      label: "Publicar e começar a vender",
      description: `${unpublished.title || "Seu evento"} já tem ingresso. Falta colocá-lo no ar.`,
      route: `/event/edit/${eventIdFor(unpublished)}?activation=first-ticket&eventId=${eventIdFor(unpublished)}`,
      eventId: eventIdFor(unpublished),
    };
  }

  return {
    stage: "selling",
    label: "Gerenciar eventos",
    description: "Seus eventos ativos estão prontos para divulgação e vendas.",
    route: "/event/manage",
  };
};
