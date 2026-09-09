const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const terminalStatusAliases = {
  canceled: "cancelled",
  failed: "rejected",
};

const normalizeEntityStatus = (entity) => {
  if (!entity || typeof entity !== "object") return entity;
  const normalized = terminalStatusAliases[normalizeStatus(entity.status)];
  if (!normalized) return entity;
  return { ...entity, status: normalized };
};

export const normalizeCommercePaymentStatuses = (payload) => {
  if (!payload || typeof payload !== "object") return payload;

  const next = { ...payload };
  if (payload.order) next.order = normalizeEntityStatus(payload.order);
  if (payload.payment) next.payment = normalizeEntityStatus(payload.payment);
  if (payload.data?.order || payload.data?.payment) {
    next.data = {
      ...payload.data,
      ...(payload.data.order ? { order: normalizeEntityStatus(payload.data.order) } : {}),
      ...(payload.data.payment ? { payment: normalizeEntityStatus(payload.data.payment) } : {}),
    };
  }
  return next;
};
