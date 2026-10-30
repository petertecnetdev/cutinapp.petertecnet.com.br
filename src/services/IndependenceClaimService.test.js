// Regressões do contrato autenticado, sem importar Axios ESM no Jest legado.
jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock("../utils/authTokenStorage", () => ({
  getAuthToken: jest.fn(),
}));

import independenceClaimService from "./IndependenceClaimService";
import appApiClient from "./AppApiClient";
import { getAuthToken } from "../utils/authTokenStorage";

const request = (overrides = {}) => ({
  entityType: "event",
  entityId: "0009007199254740993",
  applicationId: "10",
  userId: "7",
  name: " Responsável ",
  email: " ana@example.org ",
  phone: " ",
  message: " Comprovante ",
  consent: true,
  ...overrides,
});
const me = (overrides = {}) => ({
  data: {
    success: true,
    data: {
      application: { id: 10, slug: "cutinapp", ...(overrides.application || {}) },
      user: { id: 7, email: "ana@example.org", ...(overrides.user || {}) },
    },
  },
});
const denied = (status) => Object.assign(new Error("PII PRIVADA NÃO DEVE APARECER"), { status });

describe("IndependenceClaimService — preflight fail-closed W2", () => {
  let token;

  beforeEach(() => {
    jest.resetAllMocks();
    token = "token-A";
    getAuthToken.mockImplementation(() => token);
    appApiClient.get.mockResolvedValue(me());
    appApiClient.post.mockResolvedValue({ data: { status: "pending_claim", message: "PII PRIVADA" } });
  });

  test("GET /me precede POST e confirma usuário/app canônicos sem encaminhar autoridade", async () => {
    const result = await independenceClaimService.submit(request());
    expect(appApiClient.get).toHaveBeenCalledWith("/me", expect.any(Object));
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    expect(appApiClient.post).toHaveBeenCalledWith("/independence/claims", {
      entity_type: "event",
      entity_id: "9007199254740993",
      name: "Responsável",
      email: "ana@example.org",
      phone: null,
      message: "Comprovante",
      consent: true,
    });
    expect(result.status).toBe("pending_claim");
    expect(result.message).not.toContain("PII");
    expect(result.message).toContain("revisão");
  });

  test.each([
    ["app ausente", { applicationId: null }],
    ["app inválido", { applicationId: "abc" }],
    ["usuário ausente", { userId: null }],
    ["consentimento negado", { consent: false }],
    ["email ausente", { email: "" }],
  ])("%s impede GET e POST", async (_, fields) => {
    await expect(independenceClaimService.submit(request(fields))).rejects.toBeTruthy();
    expect(appApiClient.get).not.toHaveBeenCalled();
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test.each([
    ["app diferente", { application: { id: 11 } }],
    ["slug diferente", { application: { slug: "outro-app" } }],
    ["usuário diferente", { user: { id: 8 } }],
    ["email de outra conta", { user: { email: "outra@example.org" } }],
  ])("%s nega POST mesmo com GET 200", async (_, changes) => {
    appApiClient.get.mockResolvedValueOnce(me(changes));
    await expect(independenceClaimService.submit(request())).rejects.toMatchObject({ status: 403 });
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test.each([401, 403])("GET /me HTTP %i bloqueia POST e sanitiza erro", async (status) => {
    appApiClient.get.mockRejectedValueOnce(denied(status));
    await expect(independenceClaimService.submit(request())).rejects.toMatchObject({
      status, message: expect.not.stringContaining("PII"),
    });
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("GET /me indisponível impede POST", async () => {
    appApiClient.get.mockRejectedValueOnce(new Error("Erro privado de infraestrutura"));
    await expect(independenceClaimService.submit(request())).rejects.toMatchObject({ status: 503 });
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("troca A→B enquanto GET está pendente bloqueia POST", async () => {
    let resolveMe;
    appApiClient.get.mockImplementationOnce(() => new Promise((resolve) => { resolveMe = resolve; }));
    const pending = independenceClaimService.submit(request());
    token = "token-B";
    resolveMe(me());
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("evento de troca A→B→A entre abas invalida preflight mesmo com token original restaurado", async () => {
    let resolveMe;
    appApiClient.get.mockImplementationOnce(() => new Promise((resolve) => { resolveMe = resolve; }));
    const pending = independenceClaimService.submit(request());
    token = "token-B";
    window.dispatchEvent(new StorageEvent("storage", { key: "token", oldValue: "token-A", newValue: "token-B" }));
    token = "token-A";
    resolveMe(me());
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("invalidação de sessão durante preflight não publica dados privados", async () => {
    let resolveMe;
    appApiClient.get.mockImplementationOnce(() => new Promise((resolve) => { resolveMe = resolve; }));
    const pending = independenceClaimService.submit(request());
    window.dispatchEvent(new CustomEvent("petertecnet:auth-invalidated"));
    resolveMe(me());
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("resposta tardia do POST após troca de sessão não é tratada como sucesso", async () => {
    let resolvePost;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }));
    const pending = independenceClaimService.submit(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(appApiClient.post).toHaveBeenCalledTimes(1);
    token = "token-B";
    resolvePost({ data: { status: "approved", message: "PII" } });
    await expect(pending).rejects.toMatchObject({ status: 409 });
  });

  test("POST pendente descarta A→B→A com evento storage, mesmo restaurando o token original", async () => {
    let resolvePost;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }));
    const pending = independenceClaimService.submit(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    token = "token-B";
    window.dispatchEvent(new StorageEvent("storage", {
      key: "token", oldValue: "token-A", newValue: "token-B",
    }));
    token = "token-A";
    resolvePost({ data: { success: true, data: { status: "pending" } } });

    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(getAuthToken()).toBe("token-A");
  });

  test("invalidação explícita durante POST impede recibo tardio mesmo sem troca de token", async () => {
    let resolvePost;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }));
    const pending = independenceClaimService.submit(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new CustomEvent("petertecnet:auth-invalidated"));
    resolvePost({ data: { success: true, data: { status: "pending" } } });

    await expect(pending).rejects.toMatchObject({ status: 409 });
  });

  test.each([401, 403])("GET /me HTTP %i obsoleto após A→B não contamina a sessão nova", async (status) => {
    let rejectMe;
    appApiClient.get.mockImplementationOnce(() => new Promise((_, reject) => { rejectMe = reject; }));
    const pending = independenceClaimService.submit(request());

    token = "token-B";
    rejectMe(denied(status));

    await expect(pending).rejects.toMatchObject({
      status: 409,
      message: expect.not.stringContaining("PII"),
    });
    expect(getAuthToken()).toBe("token-B");
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test.each([401, 403])("POST HTTP %i obsoleto após A→B não contamina a sessão nova", async (status) => {
    let rejectPost;
    appApiClient.post.mockImplementationOnce(() => new Promise((_, reject) => { rejectPost = reject; }));
    const pending = independenceClaimService.submit(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    token = "token-B";
    rejectPost(denied(status));

    await expect(pending).rejects.toMatchObject({
      status: 409,
      message: expect.not.stringContaining("PII"),
    });
    expect(getAuthToken()).toBe("token-B");
  });

  test("401 tardio no POST não ecoa corpo privado", async () => {
    appApiClient.post.mockRejectedValueOnce(denied(401));
    await expect(independenceClaimService.submit(request())).rejects.toMatchObject({
      status: 401, message: expect.not.stringContaining("PII"),
    });
  });

  test("ID de entidade inválido não inicia preflight", async () => {
    await expect(independenceClaimService.submit(request({ entityId: "1e3" })))
      .rejects.toThrow("Identificador da entidade inválido.");
    expect(appApiClient.get).not.toHaveBeenCalled();
  });

  test("recibo real da API usa data.status=pending e não concede acesso", async () => {
    appApiClient.post.mockResolvedValueOnce({
      data: { success: true, data: { id: 42, status: "pending" } },
    });
    await expect(independenceClaimService.submit(request())).resolves.toMatchObject({
      status: "pending",
      message: expect.not.stringContaining("PII"),
    });
  });

  test.each([
    ["HTTP 204", undefined],
    ["sucesso false", { success: false, data: { status: "pending" } }],
    ["sem status", { success: true, data: {} }],
    ["approved não autoriza", { success: true, data: { status: "approved" } }],
  ])("%s nunca simula reivindicação aceita", async (_, data) => {
    appApiClient.post.mockResolvedValueOnce({ data });
    await expect(independenceClaimService.submit(request())).rejects.toMatchObject({ status: 502 });
  });

  test("mine preserva o endpoint próprio sem disparar POST", async () => {
    appApiClient.get.mockResolvedValueOnce({ data: { data: [{ id: 4 }] } });
    await expect(independenceClaimService.mine()).resolves.toEqual([{ id: 4 }]);
    expect(appApiClient.get).toHaveBeenCalledWith("/independence/claims/mine", expect.any(Object));
    expect(appApiClient.post).not.toHaveBeenCalled();
  });

  test("mine sem token bloqueia leitura privada antes do GET", async () => {
    token = "";
    await expect(independenceClaimService.mine()).rejects.toMatchObject({ status: 401 });
    expect(appApiClient.get).not.toHaveBeenCalled();
  });

  test("mine descarta sucesso tardio de A após login B sem divulgar lista de A", async () => {
    let resolveMine;
    appApiClient.get.mockImplementationOnce(() => new Promise((resolve) => { resolveMine = resolve; }));
    const pending = independenceClaimService.mine();
    token = "token-B";
    resolveMine({ data: { data: [{ id: 4, email: "privado-A@example.org" }] } });
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(getAuthToken()).toBe("token-B");
  });

  test.each([401, 403])("mine descarta HTTP %i tardio de A após login B", async (status) => {
    let rejectMine;
    appApiClient.get.mockImplementationOnce(() => new Promise((_, reject) => { rejectMine = reject; }));
    const pending = independenceClaimService.mine();
    token = "token-B";
    rejectMine(denied(status));
    await expect(pending).rejects.toMatchObject({
      status: 409, message: expect.not.stringContaining("PII"),
    });
    expect(getAuthToken()).toBe("token-B");
  });

  test("mine descarta A→B→A sinalizado enquanto GET aguarda", async () => {
    let resolveMine;
    appApiClient.get.mockImplementationOnce(() => new Promise((resolve) => { resolveMine = resolve; }));
    const pending = independenceClaimService.mine();
    token = "token-B";
    window.dispatchEvent(new StorageEvent("storage", {
      key: "token", oldValue: "token-A", newValue: "token-B",
    }));
    token = "token-A";
    resolveMine({ data: { data: [{ id: 4 }] } });
    await expect(pending).rejects.toMatchObject({ status: 409 });
  });

  test("mine descarta resposta após invalidação explícita da sessão", async () => {
    let resolveMine;
    appApiClient.get.mockImplementationOnce(() => new Promise((resolve) => { resolveMine = resolve; }));
    const pending = independenceClaimService.mine();
    window.dispatchEvent(new CustomEvent("petertecnet:auth-invalidated"));
    resolveMine({ data: { data: [{ id: 4 }] } });
    await expect(pending).rejects.toMatchObject({ status: 409 });
  });

  test.each([401, 403])("mine sanitiza HTTP %i da sessão atual", async (status) => {
    appApiClient.get.mockRejectedValueOnce(denied(status));
    await expect(independenceClaimService.mine()).rejects.toMatchObject({
      status, message: expect.not.stringContaining("PII"),
    });
  });

  test("mine nega resposta 2xx sem lista de solicitações", async () => {
    appApiClient.get.mockResolvedValueOnce({ data: { success: true } });
    await expect(independenceClaimService.mine()).rejects.toMatchObject({ status: 502 });
  });

});
