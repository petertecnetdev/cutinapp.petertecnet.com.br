import { safeGetLocalJson, safeSetLocalJson } from "./safeStorage";
import { checkoutQuantityLimit } from "./checkoutAddOns";

export const COMMERCE_CART_STORAGE_KEY = "cutinapp_commerce_cart_v1";
export const COMMERCE_CART_UPDATED_EVENT = "cutinapp:cart-updated";

const emptyCart = () => ({
  version: 1,
  events: [],
  updatedAt: null,
});

const positiveInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

const normalizeCart = (value) => {
  if (!value || value.version !== 1 || !Array.isArray(value.events)) return emptyCart();
  return {
    version: 1,
    events: value.events.filter((entry) => entry && Array.isArray(entry.tickets)),
    updatedAt: value.updatedAt || null,
  };
};

export const getCommerceCart = () => normalizeCart(safeGetLocalJson(COMMERCE_CART_STORAGE_KEY, null));

export const getCommerceCartItemCount = (cart = getCommerceCart()) => (cart.events || []).reduce(
  (total, eventEntry) => total + (eventEntry.tickets || []).reduce((sum, ticket) => sum + positiveInteger(ticket.quantity), 0),
  0,
);

const notifyCartUpdated = (cart) => {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  try {
    window.dispatchEvent(new CustomEvent(COMMERCE_CART_UPDATED_EVENT, { detail: { cart } }));
  } catch (_) {
    // Storage must keep working even when CustomEvent is unavailable.
  }
};

const persistCart = (cart) => {
  const next = { ...cart, updatedAt: new Date().toISOString() };
  if (!safeSetLocalJson(COMMERCE_CART_STORAGE_KEY, next)) {
    throw new Error("Não foi possível salvar o carrinho neste navegador.");
  }
  notifyCartUpdated(next);
  return next;
};

export const addTicketsToCommerceCart = ({ event, production, tickets }) => {
  const eventId = Number(event?.id || 0);
  const eventSlug = String(event?.slug || "").trim();
  if (!eventId || !eventSlug) throw new Error("Evento inválido para adicionar ao carrinho.");

  const additions = (Array.isArray(tickets) ? tickets : [])
    .map((ticket) => {
      const id = Number(ticket?.id || 0);
      const quantity = positiveInteger(ticket?.quantity);
      const configuredLimit = checkoutQuantityLimit("ticket");
      const requestedMax = positiveInteger(ticket?.maxQuantity) || configuredLimit;
      const maxQuantity = Math.min(configuredLimit, requestedMax);
      if (!id || !quantity || !maxQuantity) return null;
      return {
        id,
        name: String(ticket?.name || "Ingresso"),
        type: String(ticket?.type || ticket?.ticket_type || "Ingresso"),
        unitPrice: Number(ticket?.price || 0),
        quantity,
        maxQuantity,
      };
    })
    .filter(Boolean);

  if (!additions.length) throw new Error("Selecione ao menos um ingresso antes de adicionar ao carrinho.");

  const cart = getCommerceCart();
  const existingIndex = cart.events.findIndex((entry) => Number(entry.eventId) === eventId || entry.eventSlug === eventSlug);
  const existing = existingIndex >= 0 ? cart.events[existingIndex] : null;
  const mergedTickets = [...(existing?.tickets || [])];
  let addedQuantity = 0;

  additions.forEach((addition) => {
    const ticketIndex = mergedTickets.findIndex((ticket) => Number(ticket.id) === addition.id);
    const currentQuantity = ticketIndex >= 0 ? positiveInteger(mergedTickets[ticketIndex].quantity) : 0;
    const nextQuantity = Math.min(addition.maxQuantity, currentQuantity + addition.quantity);
    const actuallyAdded = Math.max(0, nextQuantity - currentQuantity);
    if (!actuallyAdded) return;

    addedQuantity += actuallyAdded;
    const nextTicket = { ...addition, quantity: nextQuantity };
    if (ticketIndex >= 0) mergedTickets[ticketIndex] = { ...mergedTickets[ticketIndex], ...nextTicket };
    else mergedTickets.push(nextTicket);
  });

  if (!addedQuantity) throw new Error("A quantidade máxima disponível destes ingressos já está no carrinho.");

  const eventEntry = {
    eventId,
    eventSlug,
    eventTitle: String(event?.title || event?.name || "Evento"),
    eventDate: event?.start_date || null,
    productionId: Number(production?.id || event?.production_id || event?.production?.id || 0) || null,
    productionSlug: String(production?.slug || event?.production?.slug || ""),
    productionName: String(production?.name || event?.production?.name || ""),
    tickets: mergedTickets,
  };

  const events = [...cart.events];
  if (existingIndex >= 0) events[existingIndex] = eventEntry;
  else events.push(eventEntry);

  const nextCart = persistCart({ version: 1, events });
  return {
    cart: nextCart,
    addedQuantity,
    itemCount: getCommerceCartItemCount(nextCart),
  };
};