const finitePositive = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const boundedPercentage = (value) => Math.min(100, finitePositive(value));

export const commissionDealPreview = ({
  tickets = [],
  commissionPercentage = 0,
  minimumRetainedMarginPercentage = 0,
  processingReservePercentage = 0,
} = {}) => {
  const normalizedTickets = (Array.isArray(tickets) ? tickets : []).map((ticket) => ({
    quantity: Math.floor(finitePositive(ticket?.quantity)),
    price: finitePositive(ticket?.price),
  }));
  const paidTickets = normalizedTickets.filter((ticket) => ticket.quantity > 0 && ticket.price > 0);
  const selloutGmv = paidTickets.reduce((sum, ticket) => sum + ticket.quantity * ticket.price, 0);
  const paidCapacity = paidTickets.reduce((sum, ticket) => sum + ticket.quantity, 0);
  const commissionRate = boundedPercentage(commissionPercentage);
  const retainedRate = boundedPercentage(minimumRetainedMarginPercentage);
  const processingRate = boundedPercentage(processingReservePercentage);

  return {
    selloutGmv,
    paidCapacity,
    averagePaidTicket: paidCapacity > 0 ? selloutGmv / paidCapacity : 0,
    agentCommissionAtSellout: selloutGmv * (commissionRate / 100),
    minimumPeterRetainedAtSellout: selloutGmv * (retainedRate / 100),
    processingReserveAtSellout: selloutGmv * (processingRate / 100),
  };
};
