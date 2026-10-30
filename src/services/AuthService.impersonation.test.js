jest.mock("./ApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import authService from "./AuthService";
import apiClient from "./ApiClient";
import { clearAuthToken, getAuthToken, setAuthToken } from "../utils/authTokenStorage";

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

describe("AuthService — logout não revoga outra sessão", () => {
  afterEach(() => {
    jest.resetAllMocks();
    clearAuthToken();
    window.localStorage.clear();
  });

  test("logout A pendente não apaga login B", async () => {
    let release;
    apiClient.post.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    setAuthToken("token-A");
    const oldLogout = authService.logout();
    setAuthToken("token-B");
    release({ data: {} });
    await oldLogout;
    expect(getAuthToken()).toBe("token-B");
  });

  test("logout A continua apagando o token quando nenhuma troca ocorreu", async () => {
    apiClient.post.mockResolvedValueOnce({ data: {} });
    setAuthToken("token-A");
    await authService.logout();
    expect(getAuthToken()).toBeNull();
  });

  test("logout antigo não apaga A restaurado depois de A→B→A", async () => {
    let release;
    apiClient.post.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    setAuthToken("token-A");
    const oldLogout = authService.logout();
    setAuthToken("token-B");
    setAuthToken("token-A");
    release({ data: {} });
    await oldLogout;
    expect(getAuthToken()).toBe("token-A");
  });
});
