const numericPriority = (item) => {
  const explicit = Number(item?.checkout_priority ?? item?.priority ?? item?.sort_order);
  return Number.isFinite(explicit) ? explicit : null;
};

const isAvailableForCheckout = (item) => {
  if (!item || item.available === false || item.expired) return false;
  const remaining = Number(item.remaining ?? item.quantity ?? 0);
  return Number.isFinite(remaining) ? remaining > 0 : true;
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
