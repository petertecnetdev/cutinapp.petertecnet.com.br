import apiClient from "./ApiClient";
import blogService from "./BlogService";

jest.mock("./ApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const keyAt = (mock, index, configIndex) => (
  mock.mock.calls[index]?.[configIndex]?.headers?.["Idempotency-Key"]
);

describe("BlogService mutation reliability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("reuses the create key after an ambiguous network failure", async () => {
    const payload = { title: "Guia de eventos", type: "article" };
    const networkError = Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
    apiClient.post
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce({ data: { data: { id: 11 } } });

    await expect(blogService.create(payload)).rejects.toThrow("Network Error");
    const firstKey = keyAt(apiClient.post, 0, 2);

    await expect(blogService.create({ ...payload })).resolves.toEqual({ id: 11 });
    expect(keyAt(apiClient.post, 1, 2)).toBe(firstKey);
  });

  test("coalesces equivalent concurrent updates", async () => {
    let resolveRequest;
    apiClient.patch.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const payload = { title: "Novo título" };
    const first = blogService.update(7, payload);
    const second = blogService.update(7, { ...payload });

    expect(second).toBe(first);
    expect(apiClient.patch).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { data: { id: 7, ...payload } } });
    await expect(first).resolves.toMatchObject({ id: 7 });
  });

  test("sends idempotency keys for publish and delete", async () => {
    apiClient.post.mockResolvedValue({ data: { data: { id: 8, status: "published" } } });
    apiClient.delete.mockResolvedValue({ data: null });

    await blogService.publish(8);
    await blogService.remove(8);

    expect(apiClient.post).toHaveBeenCalledWith(
      "/admin/content/8/publish",
      undefined,
      expect.objectContaining({ headers: { "Idempotency-Key": expect.any(String) } })
    );
    expect(apiClient.delete).toHaveBeenCalledWith(
      "/admin/content/8",
      expect.objectContaining({ headers: { "Idempotency-Key": expect.any(String) } })
    );
  });

  test("uses a new update key after a definitive validation failure", async () => {
    apiClient.patch
      .mockRejectedValueOnce({ status: 422, message: "Dados inválidos" })
      .mockResolvedValueOnce({ data: { data: { id: 9 } } });

    await expect(blogService.update(9, { title: "A" })).rejects.toMatchObject({ status: 422 });
    const rejectedKey = keyAt(apiClient.patch, 0, 2);

    await blogService.update(9, { title: "A" });
    expect(keyAt(apiClient.patch, 1, 2)).not.toBe(rejectedKey);
  });
});
