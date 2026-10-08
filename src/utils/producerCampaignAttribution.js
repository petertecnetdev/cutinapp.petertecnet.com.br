// First-party, session-scoped producer campaign attribution; no PII or auth tokens.
const STORAGE_KEY = "cutinapp_producer_campaign_v1";
const TTL_MS = 24 * 60 * 60 * 1000;
const FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const sanitize = (value) => {
  const text = String(value || "").trim();
  return /^[a-z0-9_.-]{1,100}$/i.test(text) ? text : null;
};
const parseFields = (search = "") => {
  const params = new URLSearchParams(search);
  return Object.fromEntries(FIELDS.map((key) => [key, sanitize(params.get(key))]));
};
const storage = () => {
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch (_) { return null; }
};
export const readProducerCampaign = () => {
  const session = storage();
  if (!session) return null;
  try {
    const raw = session.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!Number.isFinite(saved.expires_at) || saved.expires_at <= Date.now()) {
      session.removeItem(STORAGE_KEY);
      return null;
    }
    const campaign = Object.fromEntries(FIELDS.map((key) => [key, sanitize(saved[key])]));
    if (!campaign.utm_source) {
      session.removeItem(STORAGE_KEY);
      return null;
    }
    return { ...campaign, acquisitionSource: campaign.utm_source };
  } catch (_) { return null; }
};
export const captureProducerCampaign = (search = "") => {
  const campaign = parseFields(search);
  if (!campaign.utm_source) return readProducerCampaign();
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify({ ...campaign, expires_at: Date.now() + TTL_MS }));
  } catch (_) { /* Attribution must not interrupt signup. */ }
  return { ...campaign, acquisitionSource: campaign.utm_source };
};
export const resolveProducerCampaign = ({ state, search } = {}) => {
  const fromQuery = parseFields(search);
  const fromState = Object.fromEntries(FIELDS.map((key) => [key, sanitize(state?.[key])]));
  const saved = readProducerCampaign();
  const campaign = fromQuery.utm_source ? fromQuery : fromState.utm_source ? fromState : saved || {};
  const legacySource = sanitize(state?.acquisitionSource);
  const isPlacement = legacySource?.startsWith("producer_landing_");
  const source = campaign.utm_source || (!isPlacement ? legacySource : null) || saved?.acquisitionSource || null;
  return {
    ...Object.fromEntries(FIELDS.map((key) => [key, campaign[key] || null])),
    acquisitionSource: source,
    acquisitionPlacement: sanitize(state?.acquisitionPlacement) || (isPlacement ? legacySource : null),
  };
};
export const producerCampaignMetadata = (campaign = {}) => ({
  acquisition_source: sanitize(campaign.acquisitionSource),
  acquisition_placement: sanitize(campaign.acquisitionPlacement),
  ...Object.fromEntries(FIELDS.map((key) => [key, sanitize(campaign[key])])),
});
