const numericPriority = (item) => {
  const explicit = Number(item?.checkout_priority ?? item?.priority ?? item?.sort_order);
  return Number.isFinite(explicit) ? explicit : null;
};

export const rankCheckoutAddOns = (items = [], selectedIds = new Set(), limit = 3) => {
  const eligible = (Array.isArray(items) ? items : [])
    .filter((item) => item?.id != null && !selectedIds.has(Number(item.id)) && Number(item.price || 0) > 0)
    .map((item, index) => ({ item, index, priority: numericPriority(item), price: Number(item.price || 0) }));

  eligible.sort((a, b) => {
    const aHasPriority = a.priority !== null;
    const bHasPriority = b.priority !== null;
    if (aHasPriority !== bHasPriority) return aHasPriority ? -1 : 1;
    if (aHasPriority && a.priority !== b.priority) return a.priority - b.priority;
    if (a.price !== b.price) return a.price - b.price;
    return a.index - b.index;
  });

  return eligible.slice(0, Math.max(0, Number(limit) || 0)).map(({ item }) => item);
};
