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

const idempotencyKeyAt = (index) => (
  appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"]
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
    const firstKey = idempotencyKeyAt(0);

    await expect(messagingService.openDirect(12)).resolves.toEqual({ data: { id: 42 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new direct-open key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 422, message: "Usuário inválido" })
      .mockResolvedValueOnce({ data: { data: { id: 43 } } });

    await expect(messagingService.openDirect(12)).rejects.toMatchObject({ status: 422 });
    const rejectedKey = idempotencyKeyAt(0);

    await messagingService.openDirect(12);
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
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
    expect(idempotencyKeyAt(0)).not.toBe(idempotencyKeyAt(1));

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
    const firstKey = idempotencyKeyAt(0);

    await expect(messagingService.send(42, "Mensagem importante")).resolves.toEqual({ data: { id: 92 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 422, message: "Mensagem inválida" })
      .mockResolvedValueOnce({ data: { data: { id: 93 } } });

    await expect(messagingService.send(42, "Mensagem")).rejects.toMatchObject({ status: 422 });
    const rejectedKey = idempotencyKeyAt(0);

    await messagingService.send(42, "Mensagem");
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
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
    expect(idempotencyKeyAt(0)).not.toBe(idempotencyKeyAt(1));
  });
});
