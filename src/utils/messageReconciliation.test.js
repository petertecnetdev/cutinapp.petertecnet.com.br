import {
  reconcileMessageSnapshot,
  sortMessagesChronologically,
} from "./messageReconciliation";

describe("message reconciliation", () => {
  test("keeps optimistic and failed local messages while polling", () => {
    const current = [
      { id: 1, body: "antiga", created_at: "2026-09-07T10:00:00Z" },
      { id: "local-1", body: "enviando", created_at: "2026-09-07T10:02:00Z", pending: true },
      { id: "local-2", body: "falhou", created_at: "2026-09-07T10:03:00Z", failed: true },
    ];
    const incoming = [
      { id: 1, body: "antiga", created_at: "2026-09-07T10:00:00Z" },
      { id: 2, body: "nova", created_at: "2026-09-07T10:01:00Z" },
    ];

    expect(reconcileMessageSnapshot(current, incoming).map((message) => message.id))
      .toEqual([1, 2, "local-1", "local-2"]);
  });

  test("does not lose confirmed messages when an older snapshot arrives", () => {
    const current = [
      { id: 10, body: "dez", created_at: "2026-09-07T10:10:00Z" },
      { id: 11, body: "onze", created_at: "2026-09-07T10:11:00Z" },
    ];
    const staleIncoming = [
      { id: 10, body: "dez atualizado", created_at: "2026-09-07T10:10:00Z" },
    ];

    const result = reconcileMessageSnapshot(current, staleIncoming);
    expect(result.map((message) => message.id)).toEqual([10, 11]);
    expect(result[0].body).toBe("dez atualizado");
  });

  test("deduplicates incoming messages by id using the newest representation", () => {
    const result = reconcileMessageSnapshot([], [
      { id: 5, body: "primeira versão", created_at: "2026-09-07T10:00:00Z" },
      { id: 5, body: "versão final", created_at: "2026-09-07T10:00:00Z" },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("versão final");
  });

  test("sorts messages deterministically by timestamp and id", () => {
    const result = sortMessagesChronologically([
      { id: 20, created_at: "2026-09-07T10:01:00Z" },
      { id: 3, created_at: "2026-09-07T10:00:00Z" },
      { id: 2, created_at: "2026-09-07T10:00:00Z" },
    ]);

    expect(result.map((message) => message.id)).toEqual([2, 3, 20]);
  });
});
