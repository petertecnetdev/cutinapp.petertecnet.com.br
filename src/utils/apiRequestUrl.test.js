import { isRelativeApiRequestUrl } from "./apiRequestUrl";

describe("isRelativeApiRequestUrl", () => {
  test("allows relative API paths", () => {
    expect(isRelativeApiRequestUrl("/v1/events")).toBe(true);
    expect(isRelativeApiRequestUrl("v1/events?page=2")).toBe(true);
    expect(isRelativeApiRequestUrl("?page=2")).toBe(true);
  });

  test("blocks absolute and protocol-relative destinations", () => {
    expect(isRelativeApiRequestUrl("https://evil.example/collect")).toBe(false);
    expect(isRelativeApiRequestUrl("//evil.example/collect")).toBe(false);
    expect(isRelativeApiRequestUrl("data:text/plain,secret")).toBe(false);
    expect(isRelativeApiRequestUrl("javascript:alert(1)")).toBe(false);
  });
});
