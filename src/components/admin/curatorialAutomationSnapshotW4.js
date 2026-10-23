/** Projeção somente leitura do contrato Laravel GET /admin/automations. */
export const METRICS_W4 = Object.freeze({
  discovery_quality: { flagged_as_possible_duplicate: "Duplicações sinalizadas no último lote" },
  discovery_health: { sources: "Fontes avaliadas (máximo 500)", stale: "Fontes desatualizadas", errors: "Fontes com erro" },
  catalog_quality: { upcoming_events: "Eventos futuros", events_without_image: "Eventos sem imagem", events_without_description: "Eventos sem descrição", productions_without_logo: "Produções sem logo", artists_without_photo: "Artistas sem foto", artists_without_bio: "Artistas sem biografia" },
  candidate_freshness: { pending_review: "Candidatos pendentes", past_event_candidates: "Candidatos com evento passado", not_seen_in_seven_days: "Candidatos sem atualização há sete dias" },
});
const LABELS = { queued: "Na fila", running: "Em execução", succeeded: "Concluída", failed: "Falhou", skipped: "Ignorada" };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const obj = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const metrics = (key, result) => Object.entries(METRICS_W4[key]).map(([metric, label]) => ({
  key: metric, label, value: obj(result) ? count(result[metric]) : null,
}));
const safeError = (value) => typeof value === "string" && /^[A-Za-z_\\][A-Za-z0-9_\\]{0,159}$/.test(value) ? value.split("\\").pop() : null;
export const describeWorkerW4 = (global, local) => local === false ? "Desabilitado" :
  local !== true ? "Estado não informado" : global === false ? "Configurado; execução global desativada" :
  global !== true ? "Configurado; estado global não informado" : "Habilitado";
export function buildAutomationSnapshotW4(response) {
  const data = response?.data;
  if (response?.success !== true || !obj(data) || !Array.isArray(data.workers) || !Array.isArray(data.recent_runs)) {
    return { valid: false, globalEnabled: null, workers: [], runs: [], complete: false };
  }
  const workers = new Map();
  let complete = data.recent_runs.length <= 30;
  for (const raw of data.workers) {
    if (!obj(raw) || typeof raw.key !== "string" || !own(METRICS_W4, raw.key)) continue;
    if (workers.has(raw.key)) { complete = false; continue; }
    workers.set(raw.key, { key: raw.key, enabled: typeof raw.enabled === "boolean" ? raw.enabled : null,
      latest: null, metrics: metrics(raw.key, null) });
  }
  const runs = [], seen = new Set();
  for (const raw of data.recent_runs.slice(0, 30)) {
    if (!obj(raw) || !workers.has(raw.worker_key) || !own(LABELS, raw.status) ||
        !Number.isSafeInteger(raw.id) || raw.id <= 0 || seen.has(raw.id)) { complete = false; continue; }
    seen.add(raw.id);
    const run = { id: raw.id, key: raw.worker_key, status: raw.status, label: LABELS[raw.status],
      errorType: raw.status === "failed" ? safeError(raw.error_type) : null };
    runs.push(run);
    const worker = workers.get(raw.worker_key);
    if (!worker.latest || run.id > worker.latest.id) {
      worker.latest = run;
      // Uma execução mais nova na fila ou com falha invalida números antigos.
      worker.metrics = metrics(raw.worker_key, raw.status === "succeeded" ? raw.result : null);
    }
  }
  runs.sort((a, b) => b.id - a.id);
  return { valid: true, globalEnabled: typeof data.global_enabled === "boolean" ? data.global_enabled : null,
    workers: [...workers.values()], runs, complete };
}
