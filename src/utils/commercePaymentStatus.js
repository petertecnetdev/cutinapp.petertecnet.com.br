const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const terminalStatusAliases = {
  canceled: "cancelled",
  failed: "rejected",
  expired: "rejected",
};

const isPlainObjectPayload = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const normalizeEntityStatus = (entity) => {
  if (!entity || typeof entity !== "object") return entity;

  const status = normalizeStatus(entity.status);
  const detail = normalizeStatus(entity.status_detail || entity.statusDetail);

  if (status === "processed" && detail === "accredited") {
    return { ...entity, status: "paid" };
  }

  const normalized = terminalStatusAliases[status];
  if (!normalized) return entity;
  return { ...entity, status: normalized };
};

export const normalizeCommercePaymentStatuses = (payload) => {
  // Commerce also serves binary resources (for example receipt PDFs). Spreading
  // Blob/ArrayBuffer payloads turns them into plain objects and breaks downloads.
  if (!isPlainObjectPayload(payload)) return payload;

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