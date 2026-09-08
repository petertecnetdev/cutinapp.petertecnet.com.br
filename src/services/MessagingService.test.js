import appApiClient from "./AppApiClient";
import messagingService from "./MessagingService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const postIdempotencyKeyAt = (index) => (
  appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"]
);

const deleteIdempotencyKeyAt = (index) => (
  appApiClient.delete.mock.calls[index]?.[1]?.headers?.["Idempotency-Key"]
);

describe("MessagingService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("opens a direct conversation with an idempotency key", async () => {
    appApiClient.post.mockResolvedValue({ data: { data: { id: 41 } } });

    await expect(messagingService.openDirect("12")).resolves.toEqual({ data: { id: 41 } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/messaging/direct",
      { user_id: 12 },
      expect.objectContaining({ headers: { "Idempotency-Key": expect.any(String) } })
    );
  });

  test("reuses the same direct-open key after an ambiguous network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { data: { id: 42 } } });

    await expect(messagingService.openDirect(12)).rejects.toThrow("Network Error");
    const firstKey = postIdempotencyKeyAt(0);

    await expect(messagingService.openDirect(12)).resolves.toEqual({ data: { id: 42 } });
    expect(postIdempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new direct-open key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 422, message: "Usuário inválido" })
      .mockResolvedValueOnce({ data: { data: { id: 43 } } });

    await expect(messagingService.openDirect(12)).rejects.toMatchObject({ status: 422 });
    const rejectedKey = postIdempotencyKeyAt(0);

    await messagingService.openDirect(12);
    expect(postIdempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("coalesces equivalent concurrent direct opens but keeps different users independent", async () => {
    let resolveFirst;
    appApiClient.post
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce({ data: { data: { id: 45 } } });

    const first = messagingService.openDirect(12);
    const duplicate = messagingService.openDirect(12);
    const otherUser = messagingService.openDirect(13);

    expect(duplicate).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(postIdempotencyKeyAt(0)).not.toBe(postIdempotencyKeyAt(1));

    resolveFirst({ data: { data: { id: 44 } } });
    await expect(first).resolves.toEqual({ data: { id: 44 } });
    await expect(otherUser).resolves.toEqual({ data: { id: 45 } });
  });

  test("sends messages with an idempotency key without changing the payload", async () => {
    appApiClient.post.mockResolvedValue({ data: { data: { id: 91, body: "Olá" } } });

    await expect(messagingService.send(42, "Olá", 7)).resolves.toEqual({ data: { id: 91, body: "Olá" } });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/messaging/conversations/42/messages",
      { body: "Olá", reply_to_id: 7 },
      expect.objectContaining({ headers: { "Idempotency-Key": expect.any(String) } })
    );
  });

  test("reuses the same key after an ambiguous network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { data: { id: 92 } } });

    await expect(messagingService.send(42, "Mensagem importante")).rejects.toThrow("Network Error");
    const firstKey = postIdempotencyKeyAt(0);

    await expect(messagingService.send(42, "Mensagem importante")).resolves.toEqual({ data: { id: 92 } });
    expect(postIdempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 422, message: "Mensagem inválida" })
      .mockResolvedValueOnce({ data: { data: { id: 93 } } });

    await expect(messagingService.send(42, "Mensagem")).rejects.toMatchObject({ status: 422 });
    const rejectedKey = postIdempotencyKeyAt(0);

    await messagingService.send(42, "Mensagem");
    expect(postIdempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("coalesces equivalent concurrent sends", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = messagingService.send(42, "Mesma mensagem", 8);
    const second = messagingService.send(42, "Mesma mensagem", 8);

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { data: { id: 94 } } });
    await expect(first).resolves.toEqual({ data: { id: 94 } });
  });

  test("does not coalesce messages that differ by reply target", async () => {
    appApiClient.post.mockResolvedValue({ data: { data: { id: 95 } } });

    await messagingService.send(42, "Resposta", 10);
    await messagingService.send(42, "Resposta", 11);

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(postIdempotencyKeyAt(0)).not.toBe(postIdempotencyKeyAt(1));
  });

  test("marks a conversation as read with an idempotency key and retries safely", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { data: { read: true } } });

    await expect(messagingService.markRead("42")).rejects.toThrow("Network Error");
    const firstKey = postIdempotencyKeyAt(0);

    await expect(messagingService.markRead(42)).resolves.toEqual({ data: { read: true } });
    expect(postIdempotencyKeyAt(1)).toBe(firstKey);
    expect(appApiClient.post).toHaveBeenLastCalledWith(
      "/messaging/conversations/42/read",
      undefined,
      expect.objectContaining({ headers: { "Idempotency-Key": firstKey } })
    );
  });

  test("coalesces concurrent equivalent mark-read requests", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = messagingService.markRead(42);
    const duplicate = messagingService.markRead("42");

    expect(duplicate).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { data: { read: true } } });
    await expect(first).resolves.toEqual({ data: { read: true } });
  });

  test("archives a conversation with an idempotency key and retries safely", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.delete
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { data: { archived: true } } });

    await expect(messagingService.archive("42")).rejects.toThrow("Network Error");
    const firstKey = deleteIdempotencyKeyAt(0);

    await expect(messagingService.archive(42)).resolves.toEqual({ data: { archived: true } });
    expect(deleteIdempotencyKeyAt(1)).toBe(firstKey);
    expect(appApiClient.delete).toHaveBeenLastCalledWith(
      "/messaging/conversations/42",
      expect.objectContaining({ headers: { "Idempotency-Key": firstKey } })
    );
  });

  test("coalesces concurrent equivalent archive requests", async () => {
    let resolveRequest;
    appApiClient.delete.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = messagingService.archive(42);
    const duplicate = messagingService.archive("42");

    expect(duplicate).toBe(first);
    expect(appApiClient.delete).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { data: { archived: true } } });
    await expect(first).resolves.toEqual({ data: { archived: true } });
  });
});
