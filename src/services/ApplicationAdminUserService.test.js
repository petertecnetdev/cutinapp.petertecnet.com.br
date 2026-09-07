import appApiClient from "./AppApiClient";
import applicationAdminUserService from "./ApplicationAdminUserService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const payload = () => ({
  first_name: "  Maria  ",
  last_name: "  Silva ",
  email: " MARIA@EXAMPLE.COM ",
  role: "producer",
});

const normalizedPayload = {
  first_name: "Maria",
  last_name: "Silva",
  email: "maria@example.com",
  role: "producer",
};

const idempotencyKeyAt = (index) => (
  appApiClient.post.mock.calls[index]?.[2]?.headers?.["Idempotency-Key"]
);

describe("ApplicationAdminUserService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("lists users through the application admin endpoint", async () => {
    appApiClient.get.mockResolvedValue({ data: { data: { data: [{ id: 1 }] } } });

    await expect(applicationAdminUserService.list({ q: "maria", page: 2 })).resolves.toEqual({
      data: { data: [{ id: 1 }] },
    });

    expect(appApiClient.get).toHaveBeenCalledWith("/admin/users", {
      params: { q: "maria", page: 2 },
    });
  });

  test("normalizes creation data and sends an idempotency key", async () => {
    appApiClient.post.mockResolvedValue({ data: { message: "Usuário cadastrado" } });

    await expect(applicationAdminUserService.create(payload())).resolves.toEqual({ message: "Usuário cadastrado" });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/admin/users",
      normalizedPayload,
      expect.objectContaining({ headers: { "Idempotency-Key": expect.any(String) } })
    );
  });

  test("reuses the same key after an ambiguous network failure", async () => {
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    appApiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { user: { id: 9 } } });

    await expect(applicationAdminUserService.create(payload())).rejects.toThrow("Network Error");
    const firstKey = idempotencyKeyAt(0);

    await expect(applicationAdminUserService.create(payload())).resolves.toEqual({ user: { id: 9 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a new key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ status: 422, message: "E-mail inválido" })
      .mockResolvedValueOnce({ data: { user: { id: 10 } } });

    await expect(applicationAdminUserService.create(payload())).rejects.toMatchObject({ status: 422 });
    const rejectedKey = idempotencyKeyAt(0);

    await applicationAdminUserService.create(payload());
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("coalesces equivalent concurrent user creation submissions", async () => {
    let resolveRequest;
    appApiClient.post.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = applicationAdminUserService.create(payload());
    const second = applicationAdminUserService.create({ ...payload() });

    expect(second).toBe(first);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { user: { id: 11 } } });
    await expect(first).resolves.toEqual({ user: { id: 11 } });
  });
});
