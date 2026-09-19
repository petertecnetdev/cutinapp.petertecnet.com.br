import { cachedPublicGet, invalidatePublicRequestCache } from "./publicRequestCache";

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
    let now = 1000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const client = { get: jest.fn() };
    client.get.mockResolvedValueOnce({ data: { version: 1 } });

    await expect(cachedPublicGet(client, "/discover", { ttlMs: 5, staleMs: 1000 }))
      .resolves.toEqual({ version: 1 });

    now += 10;
    client.get.mockResolvedValueOnce({ data: { version: 2 } });

    await expect(cachedPublicGet(client, "/discover", { ttlMs: 5, staleMs: 1000 }))
      .resolves.toEqual({ version: 1 });
    expect(client.get).toHaveBeenCalledTimes(2);

    await Promise.resolve();
    await Promise.resolve();

    await expect(cachedPublicGet(client, "/discover", { ttlMs: 1000, staleMs: 2000 }))
      .resolves.toEqual({ version: 2 });
  });

  it("mantém stale quando a revalidação falha", async () => {
    let now = 2000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    const client = { get: jest.fn().mockResolvedValueOnce({ data: { safe: true } }) };
    await cachedPublicGet(client, "/home", { ttlMs: 1, staleMs: 1000 });

    now += 5;
    client.get.mockRejectedValueOnce(new Error("offline"));
    await expect(cachedPublicGet(client, "/home", { ttlMs: 1, staleMs: 1000 }))
      .resolves.toEqual({ safe: true });

    await Promise.resolve();
    await Promise.resolve();

    await expect(cachedPublicGet(client, "/home", { ttlMs: 1, staleMs: 1000 }))
      .resolves.toEqual({ safe: true });
  });
});
