import { safeGetLocalJson, safeRemoveLocalItem, safeSetLocalJson } from "./safeStorage";

const PREFIX = "cutinapp_ticket_creation_draft_";
export const TICKET_CREATION_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

const keyFor = (userId, eventId) => `${PREFIX}${Number(userId || 0)}_${Number(eventId || 0)}`;

const allowedPresets = new Set([
  "at_start",
  "before_start_30",
  "before_start_60",
  "before_start_120",
  "after_start_60",
  "after_start_120",
  "custom",
]);
const allowedModes = new Set(["before_start", "after_start", "before_end"]);
const allowedUnits = new Set(["minutes", "hours", "days"]);

const sanitizeDraft = (draft = {}) => ({
  kind: draft.kind === "free" ? "free" : "paid",
  name: String(draft.name || ""),
  price: String(draft.price || ""),
  quantity: Math.max(1, Math.min(100000, Number(draft.quantity || 1))),
  limitDate: String(draft.limitDate || ""),
  cutoffPreset: allowedPresets.has(draft.cutoffPreset) ? draft.cutoffPreset : "at_start",
  customCutoffMode: allowedModes.has(draft.customCutoffMode) ? draft.customCutoffMode : "after_start",
  customCutoffAmount: Math.max(1, Math.min(8760, Number(draft.customCutoffAmount || 2))),
  customCutoffUnit: allowedUnits.has(draft.customCutoffUnit) ? draft.customCutoffUnit : "hours",
  description: String(draft.description || "").slice(0, 2000),
  optionalDetailsOpen: Boolean(draft.optionalDetailsOpen),
});

export const clearTicketCreationDraft = (userId, eventId) => {
  if (!Number(userId || 0) || !Number(eventId || 0)) return false;
  return safeRemoveLocalItem(keyFor(userId, eventId));
};

export const readTicketCreationDraft = (userId, eventId, now = Date.now()) => {
  if (!Number(userId || 0) || !Number(eventId || 0)) return null;
  const value = safeGetLocalJson(keyFor(userId, eventId));
  if (!value || typeof value !== "object") return null;
  const savedAt = Number(value.savedAt || 0);
  if (!savedAt || savedAt > now + 5 * 60 * 1000 || now - savedAt > TICKET_CREATION_DRAFT_TTL_MS) {
    clearTicketCreationDraft(userId, eventId);
    return null;
  }
  return { ...sanitizeDraft(value.draft), savedAt };
};

export const writeTicketCreationDraft = (userId, eventId, draft = {}, now = Date.now()) => {
  if (!Number(userId || 0) || !Number(eventId || 0)) return false;
  return safeSetLocalJson(keyFor(userId, eventId), {
    version: 2,
    savedAt: Number(now),
    draft: sanitizeDraft(draft),
  });
};
