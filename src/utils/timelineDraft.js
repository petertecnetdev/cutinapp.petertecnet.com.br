const KEY = "cutinapp_timeline_draft_v2";

const safeParse = (value) => {
  try { return JSON.parse(value); } catch (_) { return null; }
};

export const createTimelineClientToken = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `tl-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

export const readTimelineDraft = () => {
  try {
    const value = safeParse(localStorage.getItem(KEY));
    if (!value || typeof value !== "object") return null;
    return value;
  } catch (_) {
    return null;
  }
};

export const writeTimelineDraft = (draft) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, saved_at: Date.now() }));
    return true;
  } catch (_) {
    return false;
  }
};

export const clearTimelineDraft = () => {
  try { localStorage.removeItem(KEY); } catch (_) { /* noop */ }
};
