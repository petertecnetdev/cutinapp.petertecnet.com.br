const apiBase = (process.env.API_BASE || "https://api.petertecnet.com.br").replace(/\/$/, "");
const origin = process.env.CUTINAPP_ORIGIN || "https://cutinapp.petertecnet.com.br";
const smokeToken = String(process.env.SMOKE_TOKEN || "").trim();

const fail = (message) => {
  throw new Error(`[production-smoke] ${message}`);
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: "error" });
  } finally {
    clearTimeout(timer);
  }
};

const readiness = async () => {
  const response = await fetchWithTimeout(`${apiBase}/api/v1/health/ready`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) fail(`readiness returned HTTP ${response.status}`);
  const body = await response.json();
  if (body?.ready !== true) fail("readiness reported ready=false");
  for (const key of ["database", "cache", "idempotency", "auth_guard"]) {
    if (body?.checks?.[key] !== true) fail(`readiness check ${key} failed`);
  }
};

const criticalPaths = [
  "/api/v1/apps/cutinapp/organizations",
  "/api/v1/apps/cutinapp/events",
  "/api/v1/apps/cutinapp/tickets",
  "/api/v1/apps/cutinapp/checkin",
  "/api/v1/apps/cutinapp/commerce/checkout",
];

const corsPreflights = async () => {
  for (const path of criticalPaths) {
    const response = await fetchWithTimeout(`${apiBase}${path}`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type,idempotency-key,x-request-id,x-peter-app,x-frontend-page",
      },
    });
    if (![200, 204].includes(response.status)) fail(`${path} preflight returned HTTP ${response.status}`);
    if (response.headers.get("access-control-allow-origin") !== origin) fail(`${path} did not allow Cutinapp origin`);
    const allowed = String(response.headers.get("access-control-allow-headers") || "").toLowerCase();
    for (const header of ["authorization", "content-type", "idempotency-key", "x-request-id", "x-peter-app", "x-frontend-page"]) {
      if (!allowed.includes(header)) fail(`${path} preflight is missing ${header}`);
    }
  }
};

const authProtection = async () => {
  const response = await fetchWithTimeout(`${apiBase}/api/v1/apps/cutinapp/health/mutation-probe`, {
    method: "POST",
    headers: { Accept: "application/json", "X-Peter-App": "cutinapp" },
  });
  if (response.status !== 401) fail(`authenticated mutation probe should reject anonymous access with 401, got ${response.status}`);
};

const authenticatedReplay = async () => {
  if (!smokeToken) {
    console.warn("[production-smoke] CUTINAPP_SMOKE_TOKEN is not configured; authenticated replay is wired but skipped.");
    return;
  }
  const key = `frontend-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${smokeToken}`,
    "X-Peter-App": "cutinapp",
    "Idempotency-Key": key,
    "X-Request-ID": `frontend-smoke-${Date.now()}`,
  };

  const first = await fetchWithTimeout(`${apiBase}/api/v1/apps/cutinapp/health/mutation-probe`, { method: "POST", headers });
  if (!first.ok) fail(`authenticated mutation probe returned HTTP ${first.status}`);
  if (String(first.headers.get("idempotency-status") || "").toLowerCase() !== "created") fail("first mutation probe was not marked created");
  const firstBody = await first.text();

  const second = await fetchWithTimeout(`${apiBase}/api/v1/apps/cutinapp/health/mutation-probe`, { method: "POST", headers });
  if (!second.ok) fail(`replayed mutation probe returned HTTP ${second.status}`);
  if (String(second.headers.get("idempotency-status") || "").toLowerCase() !== "replayed") fail("second mutation probe was not marked replayed");
  if (String(second.headers.get("idempotency-replayed") || "").toLowerCase() !== "true") fail("second mutation probe did not expose replay marker");
  const secondBody = await second.text();
  if (firstBody !== secondBody) fail("idempotency replay body changed between identical probes");
};

await readiness();
await corsPreflights();
await authProtection();
await authenticatedReplay();
console.log("[production-smoke] readiness, CORS, auth protection and mutation replay checks passed.");
