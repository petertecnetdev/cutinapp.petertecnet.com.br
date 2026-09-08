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
});
