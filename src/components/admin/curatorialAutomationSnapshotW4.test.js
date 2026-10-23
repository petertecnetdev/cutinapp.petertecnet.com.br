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
  test("falha recente fora dos primeiros 30 registros prevalece sobre sucesso antigo", () => {
    const previous = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1, worker_key: "discovery_health", status: "succeeded",
      result: { sources: 12, stale: 0, errors: 0 },
    }));
    const snapshot = read(response([...previous,
      { id: 99, worker_key: "discovery_health", status: "failed", error_type: "RuntimeException" },
    ]));
    expect(snapshot.complete).toBe(false);
    expect(snapshot.runs).toHaveLength(30);
    expect(snapshot.runs[0].id).toBe(99);
    expect(snapshot.workers[0].latest.status).toBe("failed");
    expect(snapshot.workers[0].metrics.every((metric) => metric.value === null)).toBe(true);
  });
  test("histórico inválido não permite publicar métricas antigas como atuais", () => {
    const snapshot = read(response([
      { id: 3, worker_key: "discovery_health", status: "succeeded",
        result: { sources: 20, stale: 0, errors: 0 } },
      { id: 100, worker_key: "discovery_health", status: "processing",
        result: { sources: 999, checkout_url: "https://example.invalid" } },
    ]));
    expect(snapshot.complete).toBe(false);
    expect(snapshot.workers[0].metrics.every((metric) => metric.value === null)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/999|checkout_url|example\\.invalid/);
  });
  test("exit 0 de comando desconhecido não é prova de varredura", () => {
    const snapshot = read(response([
      { id: 50, worker_key: "events:discover", status: "succeeded", command_exit_code: 0,
        result: { sources: 1000 } },
    ]));
    expect(snapshot.complete).toBe(false);
    expect(snapshot.runs).toHaveLength(0);
    expect(snapshot.workers[0].metrics.every((metric) => metric.value === null)).toBe(true);
  });
  test("rejeita histórico excessivo em vez de selecionar subconjunto enganoso", () => {
    const runs = Array.from({ length: 301 }, (_, i) => ({
      id: i + 1, worker_key: "discovery_health", status: "queued",
    }));
    expect(read(response(runs)).valid).toBe(false);
  });

  test("histórico inválido não anuncia sucesso antigo como última execução", () => {
    const snapshot = read(response([
      { id: 3, worker_key: "discovery_health", status: "succeeded",
        result: { sources: 12, stale: 0, errors: 0 } },
      { id: 100, worker_key: "discovery_health", status: "processing",
        result: { sources: 999 } },
    ]));
    expect(snapshot.valid).toBe(true);
    expect(snapshot.historyReliable).toBe(false);
    expect(snapshot.complete).toBe(false);
    expect(snapshot.workers[0].latest).toBeNull();
    expect(snapshot.workers[0].metrics.every((metric) => metric.value === null)).toBe(true);
  });

  test("configuração duplicada e contraditória não exibe estado nem métricas confiáveis", () => {
    const snapshot = read(response(undefined, { workers: [
      { key: "discovery_health", enabled: true },
      { key: "discovery_health", enabled: false },
    ] }));
    expect(snapshot.valid).toBe(true);
    expect(snapshot.complete).toBe(false);
    expect(snapshot.workers[0].enabled).toBeNull();
    expect(snapshot.historyReliable).toBe(false);
    expect(snapshot.workers[0].latest).toBeNull();
    expect(snapshot.workers[0].metrics.every((metric) => metric.value === null)).toBe(true);
  });
  test("item de configuração malformado invalida métricas, sem tratar worker desconhecido como curadoria", () => {
    const malformed = read(response(undefined, { workers: [
      { key: "discovery_health", enabled: true }, null,
    ] }));
    expect(malformed.complete).toBe(false);
    expect(malformed.workers[0].metrics.every((metric) => metric.value === null)).toBe(true);
    const other = read(response(undefined, { workers: [
      { key: "discovery_health", enabled: true }, { key: "other_service", enabled: true },
    ] }));
    expect(other.workers).toHaveLength(1);
    expect(other.workers[0].metrics[0].value).toBe(4);
  });
  test("enabled malformado invalida estado e contagens da última execução", () => {
    const snapshot = read(response(undefined, { workers: [
      { key: "discovery_health", enabled: "false" },
    ] }));
    expect(snapshot.valid).toBe(true);
    expect(snapshot.complete).toBe(false);
    expect(snapshot.historyReliable).toBe(false);
    expect(snapshot.workers[0].enabled).toBeNull();
    expect(snapshot.workers[0].latest).toBeNull();
    expect(snapshot.workers[0].metrics.every((metric) => metric.value === null)).toBe(true);
  });

  test("lista excessiva de workers é rejeitada antes de expor resultados", () => {
    const workers = Array.from({ length: 101 }, (_, i) => ({
      key: "unknown_" + i, enabled: true,
    }));
    const snapshot = read(response(undefined, { workers }));
    expect(snapshot.valid).toBe(false);
    expect(snapshot.workers).toHaveLength(0);
    expect(snapshot.runs).toHaveLength(0);
  });

});
