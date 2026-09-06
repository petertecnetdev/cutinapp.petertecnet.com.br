import { loadExternalScript } from "./loadExternalScript";

describe("loadExternalScript", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    jest.useRealTimers();
  });

  test("resolves immediately when the external SDK is already available", async () => {
    const sdk = { ready: true };
    await expect(loadExternalScript({
      src: "https://example.com/sdk.js",
      isReady: () => sdk,
    })).resolves.toBe(sdk);

    expect(document.querySelectorAll("script")).toHaveLength(0);
  });

  test("reuses a script that is already loading", async () => {
    let sdk = null;
    const first = loadExternalScript({
      src: "https://example.com/sdk.js",
      selector: 'script[data-sdk="example"]',
      attributes: { "data-sdk": "example" },
      isReady: () => sdk,
    });
    const second = loadExternalScript({
      src: "https://example.com/sdk.js",
      selector: 'script[data-sdk="example"]',
      attributes: { "data-sdk": "example" },
      isReady: () => sdk,
    });

    expect(document.querySelectorAll('script[data-sdk="example"]')).toHaveLength(1);
    sdk = { ready: true };
    document.querySelector('script[data-sdk="example"]').dispatchEvent(new Event("load"));

    await expect(first).resolves.toBe(sdk);
    await expect(second).resolves.toBe(sdk);
  });

  test("removes a broken script so the next attempt can retry cleanly", async () => {
    const promise = loadExternalScript({
      src: "https://example.com/sdk.js",
      selector: 'script[data-sdk="example"]',
      attributes: { "data-sdk": "example" },
      isReady: () => null,
      errorMessage: "SDK indisponível",
    });

    const script = document.querySelector('script[data-sdk="example"]');
    script.dispatchEvent(new Event("error"));

    await expect(promise).rejects.toThrow("SDK indisponível");
    expect(document.querySelector('script[data-sdk="example"]')).toBeNull();
  });

  test("times out instead of leaving the checkout waiting forever", async () => {
    jest.useFakeTimers();
    const promise = loadExternalScript({
      src: "https://example.com/sdk.js",
      selector: 'script[data-sdk="example"]',
      attributes: { "data-sdk": "example" },
      isReady: () => null,
      timeoutMs: 1000,
      errorMessage: "Tempo esgotado",
    });

    jest.advanceTimersByTime(1000);

    await expect(promise).rejects.toThrow("Tempo esgotado");
    expect(document.querySelector('script[data-sdk="example"]')).toBeNull();
    jest.useRealTimers();
  });
});
