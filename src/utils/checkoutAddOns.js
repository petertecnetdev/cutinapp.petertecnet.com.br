export const CHECKOUT_QUANTITY_LIMITS = Object.freeze({
  ticket: 100000,
  item: 50,
});

export const checkoutQuantityLimit = (kind) => CHECKOUT_QUANTITY_LIMITS[kind] || 0;

const numericPriority = (item) => {
  const explicit = Number(item?.checkout_priority ?? item?.priority ?? item?.sort_order);
  return Number.isFinite(explicit) ? explicit : null;
};

const isAvailableForCheckout = (item) => {
  if (!item || item.available === false || item.expired) return false;
  const stock = item.remaining ?? item.quantity;
  if (stock != null && stock !== "") {
    const remaining = Number(stock);
    if (Number.isFinite(remaining) && remaining <= 0) return false;
  }

  if (item.remaining_per_user != null && item.remaining_per_user !== "") {
    const remainingPerUser = Number(item.remaining_per_user);
    if (Number.isFinite(remainingPerUser) && remainingPerUser <= 0) return false;
  }

  return true;
};

const spreadByPrice = (entries = [], slots = 0) => {
  const available = [...entries].sort((a, b) => a.price - b.price || a.index - b.index);
  const count = Math.min(available.length, Math.max(0, Number(slots) || 0));
  if (count <= 0) return [];
  if (count >= available.length) return available;
  if (count === 1) return [available[0]];

  const selected = [];
  const usedIndexes = new Set();
  for (let position = 0; position < count; position += 1) {
    const index = Math.round((position * (available.length - 1)) / (count - 1));
    if (!usedIndexes.has(index)) {
      selected.push(available[index]);
      usedIndexes.add(index);
    }
  }

  return selected;
};

export const rankCheckoutAddOns = (items = [], selectedIds = new Set(), limit = 3) => {
  const eligible = (Array.isArray(items) ? items : [])
    .filter((item) => item?.id != null
      && !selectedIds.has(Number(item.id))
      && Number(item.price || 0) > 0
      && isAvailableForCheckout(item))
    .map((item, index) => ({ item, index, priority: numericPriority(item), price: Number(item.price || 0) }));

  const normalizedLimit = Math.max(0, Number(limit) || 0);
  if (!normalizedLimit) return [];

  const prioritized = eligible
    .filter((entry) => entry.priority !== null)
    .sort((a, b) => a.priority - b.priority || a.index - b.index);
  const selectedPrioritized = prioritized.slice(0, normalizedLimit);
  const remainingSlots = normalizedLimit - selectedPrioritized.length;

  const unprioritized = eligible.filter((entry) => entry.priority === null);
  const valueLadder = spreadByPrice(unprioritized, remainingSlots);

  return [...selectedPrioritized, ...valueLadder].map(({ item }) => item);
};

export const summarizeCheckoutAddOnOffer = (items = []) => {
  const offered = (Array.isArray(items) ? items : [])
    .filter((item) => item?.id != null && Number(item.price || 0) > 0)
    .map((item) => ({ id: Number(item.id), price: Number(item.price || 0) }));

  return {
    offered_items: offered.length,
    offered_item_ids: offered.map((item) => item.id).join(","),
    offered_item_prices: offered.map((item) => item.price.toFixed(2)).join(","),
    offered_value: Number(offered.reduce((sum, item) => sum + item.price, 0).toFixed(2)),
    min_addon_price: offered.length ? Math.min(...offered.map((item) => item.price)) : 0,
  };
};

const nonNegativeInteger = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

export const resolveCheckoutQuantity = (item, requestedQuantity, limit = 10) => {
  if (!item || item.available === false || item.expired) return 0;
  const requested = nonNegativeInteger(requestedQuantity);
  const normalizedLimit = nonNegativeInteger(limit);
  if (!requested || !normalizedLimit) return 0;

  const constraints = [requested, normalizedLimit];
  const stock = item.remaining ?? item.quantity;
  if (stock != null && stock !== "") {
    const remaining = nonNegativeInteger(stock);
    if (!remaining) return 0;
    constraints.push(remaining);
  }

  if (item.remaining_per_user != null && item.remaining_per_user !== "") {
    const remainingPerUser = nonNegativeInteger(item.remaining_per_user);
    if (!remainingPerUser) return 0;
    constraints.push(remainingPerUser);
  }

  return Math.min(...constraints);
};
