const DEFAULT_DELAYS_MS = [1500, 1500, 3000, 5000, 10000, 15000, 30000];
const RATE_LIMIT_DELAY_MS = 30000;
const MAX_RETRY_AFTER_MS = 120000;

const jitter = (base, random = Math.random, { onlyAfter = false } = {}) => {
  const sample = typeof random === "function" ? Number(random()) : 0.5;
  const bounded = Number.isFinite(sample) ? Math.min(1, Math.max(0, sample)) : 0.5;
  const jitterFactor = onlyAfter ? 1 + (bounded * 0.1) : 0.9 + (bounded * 0.2);
  return Math.round(base * jitterFactor);
};

export const parseRetryAfterMs = (retryAfter, now = Date.now()) => {
  const raw = String(retryAfter ?? "").trim();
  if (!raw) return null;

  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }

  const retryAt = Date.parse(raw);
  if (!Number.isFinite(retryAt)) return null;

  const delay = retryAt - Number(now);
  if (!Number.isFinite(delay) || delay <= 0) return null;
  return Math.min(delay, MAX_RETRY_AFTER_MS);
};

export function getPaymentSyncDelay(attempt = 0, { rateLimited = false, retryAfter = null, random = Math.random, now = Date.now() } = {}) {
  if (rateLimited) {
    const advisedDelay = parseRetryAfterMs(retryAfter, now);
    if (advisedDelay != null) return jitter(advisedDelay, random, { onlyAfter: true });
    return jitter(RATE_LIMIT_DELAY_MS, random);
  }

  const index = Math.max(0, Math.min(Number(attempt) || 0, DEFAULT_DELAYS_MS.length - 1));
  return jitter(DEFAULT_DELAYS_MS[index], random);
}

export { DEFAULT_DELAYS_MS, MAX_RETRY_AFTER_MS, RATE_LIMIT_DELAY_MS };
