const DEFAULT_DELAYS_MS = [1500, 3000, 5000, 10000, 15000, 30000, 60000];
const RATE_LIMIT_DELAY_MS = 30000;

export function getPaymentSyncDelay(attempt = 0, { rateLimited = false, random = Math.random } = {}) {
  if (rateLimited) return RATE_LIMIT_DELAY_MS;
  const index = Math.max(0, Math.min(Number(attempt) || 0, DEFAULT_DELAYS_MS.length - 1));
  const base = DEFAULT_DELAYS_MS[index];
  const sample = typeof random === "function" ? Number(random()) : 0.5;
  const bounded = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0.5;
  const jitterFactor = 0.9 + (bounded * 0.2);
  return Math.round(base * jitterFactor);
}

export { DEFAULT_DELAYS_MS, RATE_LIMIT_DELAY_MS };
