import { createRequestId, getHeaderValue, resolveRequestId } from "./requestCorrelation";

describe("requestCorrelation", () => {
  test("reads headers case-insensitively", () => {
    expect(getHeaderValue({ "X-Request-ID": "req-123" }, "x-request-id")).toBe("req-123");
  });

  test("prefers server request id over client request id", () => {
    expect(resolveRequestId({
      responseHeaders: { "x-request-id": "server-456" },
      requestHeaders: { "X-Request-ID": "client-123" },
    })).toBe("server-456");
  });

  test("falls back to correlation id and then client request id", () => {
    expect(resolveRequestId({
      responseHeaders: { "x-correlation-id": "server-correlation" },
      requestHeaders: { "X-Request-ID": "client-123" },
    })).toBe("server-correlation");

    expect(resolveRequestId({
      requestHeaders: { "X-Request-ID": "client-123" },
    })).toBe("client-123");
  });

  test("creates a non-empty request id", () => {
    expect(createRequestId()).toEqual(expect.any(String));
    expect(createRequestId().length).toBeGreaterThan(8);
  });
});
