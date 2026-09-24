jest.mock("./ApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import authService from "./AuthService";
import { clearAuthToken, setAuthToken } from "../utils/authTokenStorage";

const encodeSegment = (value) =>
  window.btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const tokenFor = (payload) => `${encodeSegment({ alg: "none", typ: "JWT" })}.${encodeSegment(payload)}.signature`;

describe("AuthService admin impersonation detection", () => {
  afterEach(() => {
    clearAuthToken();
    window.localStorage.clear();
  });

  test("recognizes only a scoped impersonation token", () => {
    setAuthToken(tokenFor({
      sub: 123,
      impersonated: true,
      impersonation_session_id: 456,
      actor_user_id: 1,
    }));

    expect(authService.isAdministrativeImpersonation()).toBe(true);
  });

  test("does not treat a normal user token as administrative impersonation", () => {
    setAuthToken(tokenFor({ sub: 123 }));

    expect(authService.isAdministrativeImpersonation()).toBe(false);
  });

  test("requires the server impersonation session claim", () => {
    setAuthToken(tokenFor({ sub: 123, impersonated: true }));

    expect(authService.isAdministrativeImpersonation()).toBe(false);
  });

  test("fails closed for malformed tokens", () => {
    setAuthToken("not-a-jwt");

    expect(authService.isAdministrativeImpersonation()).toBe(false);
  });
});
