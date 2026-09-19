import { cachedPublicGet, invalidatePublicRequestCache } from "./publicRequestCache";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("publicRequestCache", () => {
  beforeEach(() => {
    invalidatePublicRequestCache();
    window.sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it("deduplica requisições simultâneas para a mesma chave", async () => {
    let resolveRequest;
    const client = {
      get: jest.fn(() => new Promise((resolve) => { resolveRequest = resolve; })),
    };

    const first = cachedPublicGet(client, "/events", { params: { page: 1 } });
    const second = cachedPublicGet(client, "/events", { params: { page: 1 } });

    expect(client.get).toHaveBeenCalledTimes(1);
    resolveRequest({ data: { items: [1] } });

    await expect(first).resolves.toEqual({ items: [1] });
    await expect(second).resolves.toEqual({ items: [1] });
  });

  it("retorna stale imediatamente e revalida em segundo plano", async () => {
    const client = { get: jest.fn() };
    client.get.mockResolvedValueOnce({ data: { version: 1 } });

    await expect(cachedPublicGet(client, "/discover", { ttlMs: 5, staleMs: 1000 }))
      .resolves.toEqual({ version: 1 });

    await new Promise((resolve) => setTimeout(resolve, 10));
    client.get.mockResolvedValueOnce({ data: { version: 2 } });

    await expect(cachedPublicGet(client, "/discover", { ttlMs: 5, staleMs: 1000 }))
      .resolves.toEqual({ version: 1 });

    expect(client.get).toHaveBeenCalledTimes(2);
    await flush();

    await expect(cachedPublicGet(client, "/discover", { ttlMs: 1000, staleMs: 2000 }))
      .resolves.toEqual({ version: 2 });
  });

  it("mantém stale quando a revalidação falha", async () => {
    const client = { get: jest.fn().mockResolvedValueOnce({ data: { safe: true } }) };
    await cachedPublicGet(client, "/home", { ttlMs: 1, staleMs: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 5));

    client.get.mockRejectedValueOnce(new Error("offline"));
    await expect(cachedPublicGet(client, "/home", { ttlMs: 1, staleMs: 1000 }))
      .resolves.toEqual({ safe: true });
    await flush();

    await expect(cachedPublicGet(client, "/home", { ttlMs: 1, staleMs: 1000 }))
      .resolves.toEqual({ safe: true });
  });
});
