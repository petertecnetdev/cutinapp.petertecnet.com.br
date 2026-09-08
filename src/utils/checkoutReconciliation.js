const normalizeQuantity = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
};

const normalizeMoney = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const lineName = (entry, kind) => entry?.name || entry?.title || (kind === "ticket" ? "Ingresso" : "Item");

const summarizeKind = (kind, previous = [], next = [], catalog = []) => {
  const previousById = new Map((Array.isArray(previous) ? previous : []).map((entry) => [Number(entry?.id), normalizeQuantity(entry?.quantity)]));
  const nextById = new Map((Array.isArray(next) ? next : []).map((entry) => [Number(entry?.id), normalizeQuantity(entry?.quantity)]));
  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((entry) => [Number(entry?.id), entry]));
  const ids = new Set([...previousById.keys(), ...nextById.keys()]);
  const changes = [];
  let previousValue = 0;
  let reconciledValue = 0;
  let unpricedRemovedLines = 0;

  ids.forEach((id) => {
    if (!Number.isFinite(id)) return;
    const before = previousById.get(id) || 0;
    const after = nextById.get(id) || 0;
    const item = catalogById.get(id);
    const hasKnownPrice = item?.price != null && Number.isFinite(Number(item.price));
    const unitPrice = hasKnownPrice ? normalizeMoney(item.price) : 0;
    previousValue += before * unitPrice;
    reconciledValue += after * unitPrice;
    if (before > after && !hasKnownPrice) unpricedRemovedLines += 1;
    if (before === after) return;
    changes.push({
      kind,
      id,
      name: lineName(item, kind),
      previous_quantity: before,
      new_quantity: after,
      unit_price: unitPrice,
      removed_value: Number((Math.max(0, before - after) * unitPrice).toFixed(2)),
    });
  });

  return { changes, previousValue, reconciledValue, unpricedRemovedLines };
};

export const summarizeCheckoutReconciliation = ({ catalog = {}, previousSelection = {}, nextSelection = {} } = {}) => {
  const tickets = summarizeKind("ticket", previousSelection?.tickets, nextSelection?.tickets, catalog?.tickets);
  const items = summarizeKind("item", previousSelection?.items, nextSelection?.items, catalog?.items);
  const previousGmv = Number((tickets.previousValue + items.previousValue).toFixed(2));
  const reconciledGmv = Number((tickets.reconciledValue + items.reconciledValue).toFixed(2));
  const changes = [...tickets.changes, ...items.changes];

  return {
    changes,
    changed_lines: changes.length,
    previous_gmv: previousGmv,
    reconciled_gmv: reconciledGmv,
    gmv_removed: Number(Math.max(0, previousGmv - reconciledGmv).toFixed(2)),
    unpriced_removed_lines: tickets.unpricedRemovedLines + items.unpricedRemovedLines,
  };
};

export const checkoutReconciliationMessage = (summary, moneyFormatter = (value) => String(value)) => {
  const changes = Array.isArray(summary?.changes) ? summary.changes : [];
  if (!changes.length) return "Sua seleção foi atualizada para a disponibilidade atual do evento. Revise o resumo antes de pagar.";

  const details = changes.slice(0, 3).map((change) => {
    if (change.new_quantity <= 0) return change.name + ": removido";
    return change.name + ": " + change.previous_quantity + " → " + change.new_quantity;
  });
  const remaining = changes.length - details.length;
  if (remaining > 0) details.push("e mais " + remaining + " " + (remaining === 1 ? "ajuste" : "ajustes"));

  const knownDelta = Number(summary?.gmv_removed || 0) > 0 && Number(summary?.unpriced_removed_lines || 0) === 0;
  const totalText = knownDelta
    ? " Total ajustado de " + moneyFormatter(summary.previous_gmv) + " para " + moneyFormatter(summary.reconciled_gmv) + "."
    : "";

  return "A disponibilidade mudou: " + details.join("; ") + "." + totalText + " Revise o resumo antes de pagar.";
};
