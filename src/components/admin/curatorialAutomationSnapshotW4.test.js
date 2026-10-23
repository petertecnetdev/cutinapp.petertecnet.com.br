import { buildAutomationSnapshotW4 as read, describeWorkerW4 } from "./curatorialAutomationSnapshotW4";
const response = (runs = [{ id: 3, worker_key: "discovery_health", status: "succeeded",
  result: { sources: 4, stale: 0, errors: 1 } }], extra = {}) => ({
  success: true, data: { global_enabled: true, workers: [{ key: "discovery_health", enabled: true }],
    recent_runs: runs, ...extra },
});
describe("W4: contrato real de leitura de automações", () => {
  test("nega envelopes malformados", () => {
    expect(read(null).valid).toBe(false);
    expect(read({ success: false, data: response().data }).valid).toBe(false);
    expect(read({ success: true, data: { workers: [] } }).valid).toBe(false);
  });
  test("preserva zero e não converte strings em contagens", () => {
    const worker = read(response()).workers[0];
    expect(worker.metrics.map((item) => item.value)).toEqual([4, 0, 1]);
    const malformed = read(response([{ id: 4, worker_key: "discovery_health", status: "succeeded",
      result: { sources: "4", stale: -1, errors: null } }]));
    expect(malformed.workers[0].metrics.every((item) => item.value === null)).toBe(true);
  });
  test("falha mais recente não reutiliza métricas anteriores", () => {
    const snapshot = read(response([
      { id: 5, worker_key: "discovery_health", status: "failed", error_type: "RuntimeException" },
      { id: 3, worker_key: "discovery_health", status: "succeeded", result: { sources: 4 } },
    ]));
    expect(snapshot.workers[0].latest.status).toBe("failed");
    expect(snapshot.workers[0].metrics.every((item) => item.value === null)).toBe(true);
    expect(snapshot.runs[0].errorType).toBe("RuntimeException");
  });
  test("fila pendente não é varredura concluída, mesmo com exit 0", () => {
    const snapshot = read(response([{ id: 6, worker_key: "discovery_health", status: "queued",
      command_exit_code: 0 }], { global_enabled: false }));
    expect(snapshot.workers[0].latest.status).toBe("queued");
    expect(snapshot.workers[0].metrics[0].value).toBeNull();
    expect(describeWorkerW4(snapshot.globalEnabled, true)).toMatch(/global desativada/);
  });
  test("remove URLs, tokens, mensagens de erro e campos comerciais", () => {
    const snapshot = read(response([{ id: 3, worker_key: "discovery_health", status: "failed",
      error_type: "token=/secret", last_error: "Bearer SECRET", checkout_url: "https://example.invalid",
      result: { token: "SECRET" } }]));
    expect(JSON.stringify(snapshot)).not.toMatch(/SECRET|example\.invalid|checkout|token=|\/secret/);
  });
  test("ignora trabalhadores desconhecidos e histórico duplicado", () => {
    const snapshot = read(response([
      { id: 3, worker_key: "discovery_health", status: "queued" },
      { id: 3, worker_key: "discovery_health", status: "queued" },
      { id: 4, worker_key: "unknown", status: "succeeded" },
    ]));
    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.complete).toBe(false);
  });
  test("não confunde proprietário local com root nem atribui autorização", () => {
    expect(read(response()).workers[0]).not.toHaveProperty("is_root");
    expect(describeWorkerW4(true, false)).toBe("Desabilitado");
    expect(describeWorkerW4(null, true)).toMatch(/não informado/);
  });
});
