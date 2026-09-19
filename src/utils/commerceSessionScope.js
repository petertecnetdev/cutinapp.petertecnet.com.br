import {
  safeGetLocalItem,
  safeSetLocalItem,
} from "./safeStorage";

export const COMMERCE_SCOPE_CHANGE_EVENT = "cutinapp:commerce-scope-change";

const COMMERCE_SCOPE_KEY = "cutinapp_commerce_scope_v1";
const COMMERCE_SCOPE_VERSION_KEY = "cutinapp_commerce_scope_version";
const COMMERCE_SCOPE_VERSION = "2";
const COMMERCE_STORAGE_PREFIXES = [
  "cutinapp_checkout_",
  "cutinapp_payment_",
];
const COMMERCE_STORAGE_KEYS = [
  "cutinapp_commerce_cart_v1",
];

const fingerprint = (value) => {
  const input = String(value || "").trim().toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const userScope = (user) => {
  const id = String(user?.id ?? user?.public_id ?? "").trim();
  if (id) return `user:${id}`;
  const email = String(user?.email || "").trim().toLowerCase();
  return email ? `user-email:${fingerprint(email)}` : null;
};

const removeMatchingKeys = (storage) => {
  if (!storage) return 0;
  let removed = 0;
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key) continue;
      if (!COMMERCE_STORAGE_KEYS.includes(key) && !COMMERCE_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
      storage.removeItem(key);
      removed += 1;
    }
  } catch (_) {
    // Commerce isolation remains best-effort when browser storage is restricted.
  }
  return removed;
};

const notifyCommerceScopeChange = (scope, cleared) => {
  if (typeof window === "undefined") return;
  [
    COMMERCE_SCOPE_CHANGE_EVENT,
    "cutinapp-cart-updated",
    "cutinapp:cart-updated",
    "cutinapp:checkout-recovery-change",
  ].forEach((eventName) => {
    try {
      window.dispatchEvent(new CustomEvent(eventName, { detail: { scope, cleared } }));
    } catch (_) {
      // UI refresh must never break authentication or checkout.
    }
  });
};

export const isCommerceScopeReady = () => safeGetLocalItem(COMMERCE_SCOPE_VERSION_KEY) === COMMERCE_SCOPE_VERSION;

export const clearCommerceClientState = ({ notify = true } = {}) => {
  if (typeof window === "undefined") return 0;
  const cleared = removeMatchingKeys(window.localStorage) + removeMatchingKeys(window.sessionStorage);
  if (notify) notifyCommerceScopeChange(safeGetLocalItem(COMMERCE_SCOPE_KEY) || "guest", cleared);
  return cleared;
};

export const synchronizeCommerceScope = (user) => {
  const nextScope = user ? userScope(user) : "guest";
  if (!nextScope) {
    clearCommerceClientState();
    safeSetLocalItem(COMMERCE_SCOPE_KEY, "guest");
    safeSetLocalItem(COMMERCE_SCOPE_VERSION_KEY, COMMERCE_SCOPE_VERSION);
    notifyCommerceScopeChange("guest", true);
    return { scope: "guest", cleared: true };
  }

  const currentScope = safeGetLocalItem(COMMERCE_SCOPE_KEY);
  const migrated = isCommerceScopeReady();
  const guestToAuthenticated = currentScope === "guest" && nextScope.startsWith("user");
  const mustClear = !migrated
    || (!currentScope && nextScope !== "guest")
    || (Boolean(currentScope) && currentScope !== nextScope && !guestToAuthenticated);

  const cleared = mustClear ? clearCommerceClientState({ notify: false }) : 0;
  safeSetLocalItem(COMMERCE_SCOPE_KEY, nextScope);
  safeSetLocalItem(COMMERCE_SCOPE_VERSION_KEY, COMMERCE_SCOPE_VERSION);
  notifyCommerceScopeChange(nextScope, cleared);

  return { scope: nextScope, cleared: cleared > 0 };
};
