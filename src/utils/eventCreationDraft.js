import { safeGetLocalJson, safeRemoveLocalItem, safeSetLocalJson } from "./safeStorage";

const PREFIX = "cutinapp_event_creation_draft_";
export const EVENT_CREATION_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const keyFor = (userId) => `${PREFIX}${Number(userId || 0)}`;

const sanitizeForm = (form = {}) => ({
  production_id: String(form.production_id || ""),
  title: String(form.title || ""),
  description: String(form.description || ""),
  address: String(form.address || ""),
  google_maps_url: String(form.google_maps_url || ""),
  city: String(form.city || ""),
  uf: String(form.uf || "").toUpperCase().slice(0, 2),
  venue: String(form.venue || ""),
  start_date: String(form.start_date || ""),
  end_date: String(form.end_date || ""),
  max_attendees: String(form.max_attendees || ""),
  // Contact fields and image are intentionally not persisted locally.
  contact_email: "",
  contact_phone: "",
  image: null,
});

export const clearEventCreationDraft = (userId) => {
  if (!Number(userId || 0)) return false;
  return safeRemoveLocalItem(keyFor(userId));
};

export const readEventCreationDraft = (userId, now = Date.now()) => {
  if (!Number(userId || 0)) return null;
  const value = safeGetLocalJson(keyFor(userId));
  if (!value || typeof value !== "object") return null;
  const savedAt = Number(value.savedAt || 0);
  if (!savedAt || savedAt > now + 5 * 60 * 1000 || now - savedAt > EVENT_CREATION_DRAFT_TTL_MS) {
    clearEventCreationDraft(userId);
    return null;
  }
  return {
    form: sanitizeForm(value.form),
    useProductionItems: Boolean(value.useProductionItems),
    savedAt,
  };
};

export const writeEventCreationDraft = (userId, { form, useProductionItems = false } = {}, now = Date.now()) => {
  if (!Number(userId || 0)) return false;
  return safeSetLocalJson(keyFor(userId), {
    version: 1,
    savedAt: Number(now),
    form: sanitizeForm(form),
    useProductionItems: Boolean(useProductionItems),
  });
};
