const MAX_SOURCE_LENGTH = 120;

export const normalizeProducerAcquisitionSource = (value) => {
  const normalized = String(value || "").trim().slice(0, MAX_SOURCE_LENGTH);
  return normalized || null;
};

export const resolveProducerAcquisitionSource = ({ state, search } = {}) => {
  const query = new URLSearchParams(search || "");
  return normalizeProducerAcquisitionSource(
    state?.acquisitionSource || query.get("acquisitionSource") || query.get("from")
  );
};

export const buildPublishedEventActivationMetadata = ({ eventId, productionId, acquisitionSource } = {}) => ({
  event_id: Number(eventId || 0) || null,
  production_id: Number(productionId || 0) || null,
  acquisition_source: normalizeProducerAcquisitionSource(acquisitionSource),
  activation_stage: "event_published",
  next_step: "create_ticket",
});

export const buildTicketCreationHandoff = ({ eventId, acquisitionSource } = {}) => {
  const id = Number(eventId || 0);
  if (!id) return null;

  const source = normalizeProducerAcquisitionSource(acquisitionSource);
  const query = new URLSearchParams({ eventId: String(id) });
  if (source) query.set("acquisitionSource", source);

  return {
    pathname: "/ticket/create",
    search: `?${query.toString()}`,
    state: source ? { acquisitionSource: source } : undefined,
  };
};
