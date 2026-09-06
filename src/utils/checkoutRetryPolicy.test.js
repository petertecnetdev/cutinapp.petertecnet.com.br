import { shouldKeepCheckoutAttempt } from "./checkoutRetryPolicy";

describe("shouldKeepCheckoutAttempt", () => {
  test.each([408, 409, 425, 429, 500, 502, 503, 504])("keeps idempotency key for uncertain HTTP %s responses", (status) => {
    expect(shouldKeepCheckoutAttempt({ status })).toBe(true);
  });

  test.each([400, 401, 403, 404, 422])("allows a fresh attempt after definitive HTTP %s responses", (status) => {
    expect(shouldKeepCheckoutAttempt({ status })).toBe(false);
  });

  test("reads axios response status", () => {
    expect(shouldKeepCheckoutAttempt({ response: { status: 503 } })).toBe(true);
  });
});
