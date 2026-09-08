import apiClient from "./ApiClient";
import userService from "./UserService";

jest.mock("./ApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

const idempotencyKeyAt = (index) => (
  apiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"]
);

const deleteIdempotencyKeyAt = (index) => (
  apiClient.delete.mock.calls[index]?.[1]?.headers?.["Idempotency-Key"]
);

const profilePayload = () => {
  const data = new FormData();
  data.append("first_name", "Maria");
  data.append("last_name", "Silva");
  return data;
};

describe("UserService mutation reliability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key with multipart profile updates", async () => {
    apiClient.post.mockResolvedValue({ data: { user: { id: 7 } } });

    await expect(userService.update(7, profilePayload())).resolves.toEqual({ user: { id: 7 } });

    expect(apiClient.post).toHaveBeenCalledWith(
      "/user/7",
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "multipart/form-data",
          "Idempotency-Key": expect.any(String),
        }),
      })
    );
  });

  test("reuses the update key after an ambiguous network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    apiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { user: { id: 7 } } });

    await expect(userService.update(7, profilePayload())).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    await expect(userService.update(7, profilePayload())).resolves.toEqual({ user: { id: 7 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new update key after a definitive validation failure", async () => {
    apiClient.post
      .mockRejectedValueOnce({ status: 422, message: "Dados inválidos" })
      .mockResolvedValueOnce({ data: { user: { id: 7 } } });

    await expect(userService.update(7, profilePayload())).rejects.toMatchObject({ status: 422 });
    const rejectedKey = idempotencyKeyAt(0);

    await userService.update(7, profilePayload());
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("coalesces equivalent concurrent profile updates", async () => {
    let resolveRequest;
    apiClient.post.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = userService.update(7, profilePayload());
    const second = userService.update(7, profilePayload());

    expect(second).toBe(first);
    expect(apiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { user: { id: 7 } } });
    await expect(first).resolves.toEqual({ user: { id: 7 } });
  });

  test("protects user creation retries with idempotency", async () => {
    const payload = { first_name: "Maria", email: "maria@example.com" };
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    apiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { user: { id: 8 } } });

    await expect(userService.store(payload)).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    await expect(userService.store({ ...payload })).resolves.toEqual({ user: { id: 8 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
    expect(apiClient.post.mock.calls[1][0]).toBe("/user/new");
  });

  test("reuses the deletion key after an ambiguous network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    apiClient.delete
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { deleted: true } });

    await expect(userService.destroy(12)).rejects.toThrow("Network Error");
    const firstKey = deleteIdempotencyKeyAt(0);

    await expect(userService.destroy("12")).resolves.toEqual({ deleted: true });
    expect(deleteIdempotencyKeyAt(1)).toBe(firstKey);
    expect(apiClient.delete.mock.calls[1][0]).toBe("/user/12");
  });

  test("uses a new deletion key after a definitive failure", async () => {
    apiClient.delete
      .mockRejectedValueOnce({ status: 403, message: "Acesso negado" })
      .mockResolvedValueOnce({ data: { deleted: true } });

    await expect(userService.destroy(12)).rejects.toMatchObject({ status: 403 });
    const rejectedKey = deleteIdempotencyKeyAt(0);

    await userService.destroy(12);
    expect(deleteIdempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("coalesces equivalent concurrent user deletions", async () => {
    let resolveRequest;
    apiClient.delete.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = userService.destroy(12);
    const second = userService.destroy("12");

    expect(second).toBe(first);
    expect(apiClient.delete).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { deleted: true } });
    await expect(first).resolves.toEqual({ deleted: true });
  });
});
