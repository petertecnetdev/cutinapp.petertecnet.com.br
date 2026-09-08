import { checkoutQuantityLimit, resolveCheckoutQuantity } from "./checkoutAddOns";

export const reconcileStoredSelection = (catalog, storedCheckout, fallbackEventId = 0) => {
  const eventId = Number(catalog?.event?.id || fallbackEventId || 0);
  if (!storedCheckout || Number(storedCheckout?.eventId || 0) !== eventId) return {};

  const restored = {};
  const reconcile = (kind, catalogItems, storedItems) => {
    const limit = checkoutQuantityLimit(kind);
    const availableById = new Map((catalogItems || []).map((item) => [String(item.id), item]));
    (storedItems || []).forEach((entry) => {
      const item = availableById.get(String(entry?.id));
      if (!item) return;
      const max = resolveCheckoutQuantity(item, limit, limit);
      const quantity = Math.max(0, Math.min(max, Number(entry?.quantity || 0)));
      if (quantity > 0) restored[`${kind}:${item.id}`] = quantity;
    });
  };

  reconcile("ticket", catalog?.tickets, storedCheckout?.tickets);
  reconcile("item", catalog?.items, storedCheckout?.items);
  return restored;
};
