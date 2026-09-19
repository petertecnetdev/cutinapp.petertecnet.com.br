import { cachedPublicGet, invalidatePublicRequestCache } from "./publicRequestCache";

describe("publicRequestCache", () => {
  beforeEach(() => {
    invalidatePublicRequestCache();
    window.sessionStorage.clear();
  });

  it("deduplicates concurrent reads for the same public resource", async () => {
    let resolveRequest;
    const get = jest.fn(() => new Promise((resolve) => { resolveRequest = resolve; }));
    const client = { get };

    const first = cachedPublicGet(client, "/events", { params: { page: 1 } });
    const second = cachedPublicGet(client, "/events", { params: { page: 1 } });

    expect(get).toHaveBeenCalledTimes(1);
    resolveRequest({ data: { events: [1] } });
    await expect(first).resolves.toEqual({ events: [1] });
    await expect(second).resolves.toEqual({ events: [1] });
  });

  it("aborts an obsolete in-flight request when its cache prefix is invalidated", async () => {
    let capturedSignal;
    const get = jest.fn((_url, config) => {
      capturedSignal = config.signal;
      return new Promise((_resolve, reject) => {
        config.signal.addEventListener("abort", () => reject(Object.assign(new Error("canceled"), { name: "AbortError" })));
      });
    });

    const pending = cachedPublicGet({ get }, "/events", { params: { q: "old" } });
    expect(capturedSignal.aborted).toBe(false);

    invalidatePublicRequestCache("/events");
    expect(capturedSignal.aborted).toBe(true);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
