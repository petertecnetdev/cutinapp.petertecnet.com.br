import { createScopedAdminContextGuard } from "./scopedAdminContextGuard";

const authorized = (application_id = 7) => ({
  authorized: true,
  application_id,
  permissions: ["users.view"],
  is_owner: false,
});

describe("Administrator: autorização isolada por sessão e aplicação", () => {
  let guard;
  beforeEach(() => { guard = createScopedAdminContextGuard(); });

  test.each([401, 403])("revogação HTTP %i nega o acesso e invalida respostas pendentes", (status) => {
    const request = guard.begin({ token: "delegado", applicationId: 7 });
    const concurrent = guard.begin({ token: "delegado", applicationId: 7 });
    expect(guard.resolve(request, { context: authorized() })).toEqual(authorized());
    expect(guard.resolve(request, { status, context: authorized() })).toBeNull();
    expect(guard.resolve(concurrent, { context: authorized() })).toBeNull();
  });

  test("troca de token impede resposta antiga do root de chegar ao novo usuário", () => {
    const rootRequest = guard.begin({ token: "token-root", applicationId: 7 });
    const userRequest = guard.begin({ token: "token-usuario", applicationId: 7 });
    expect(guard.resolve(rootRequest, { context: { ...authorized(), is_owner: true } })).toBeNull();
    expect(guard.resolve(userRequest, { context: { authorized: false, application_id: 7 } })).toBeNull();
  });

  test("troca de app com token idêntico impede reutilização de autoridade anterior", () => {
    const cutinappRequest = guard.begin({ token: "token-compartilhado", applicationId: 7 });
    const otherAppRequest = guard.begin({ token: "token-compartilhado", applicationId: 8 });
    expect(guard.resolve(cutinappRequest, { context: authorized(7) })).toBeNull();
    expect(guard.resolve(otherAppRequest, { context: authorized(7) })).toBeNull();
    expect(guard.resolve(otherAppRequest, { context: authorized(8) })).toEqual(authorized(8));
  });

  test("logout invalida requisições antigas e impede reaproveitamento após login", () => {
    const beforeLogout = guard.begin({ token: "token-antigo", applicationId: 7 });
    expect(guard.begin({ token: null, applicationId: 7 })).toBeNull();
    const afterLogin = guard.begin({ token: "token-antigo", applicationId: 7 });
    expect(guard.resolve(beforeLogout, { context: authorized() })).toBeNull();
    expect(guard.resolve(afterLogin, { context: authorized() })).toEqual(authorized());
  });

  test("sem token ou applicationId conhecido o resultado é sempre negado", () => {
    expect(guard.begin({ token: "abc" })).toBeNull();
    expect(guard.begin({ token: "abc", applicationId: "" })).toBeNull();
    expect(guard.resolve(null, { context: authorized() })).toBeNull();
  });

  test("contexto autorizado sem application_id não é aceito", () => {
    const request = guard.begin({ token: "abc", applicationId: 7 });
    expect(guard.resolve(request, { context: { authorized: true, is_owner: true } })).toBeNull();
  });

  test("atributos is_owner/is_root não substituem authorized da API", () => {
    const request = guard.begin({ token: "abc", applicationId: 7 });
    expect(guard.resolve(request, { context: { ...authorized(), authorized: false, is_owner: true, is_root: true } })).toBeNull();
  });

  test("invalidação explícita bloqueia retorno tardio mesmo sem trocar token", () => {
    const request = guard.begin({ token: "abc", applicationId: 7 });
    guard.invalidate();
    expect(guard.resolve(request, { context: authorized() })).toBeNull();
  });

  test("ticket forjado ou de outro guard não concede autoridade", () => {
    const request = guard.begin({ token: "token-a", applicationId: 7 });
    const foreignGuard = createScopedAdminContextGuard();
    const foreignRequest = foreignGuard.begin({ token: "token-a", applicationId: 7 });
    expect(guard.resolve({ ...request }, { status: 200, context: authorized() })).toBeNull();
    expect(guard.resolve(foreignRequest, { status: 200, context: authorized() })).toBeNull();
    expect(guard.resolve(request, { status: 200, context: authorized() })).toEqual(authorized());
  });

  test.each([0, 302, 400, 404, 429, 500, 503, "200"])(
    "HTTP %s nunca reaproveita contexto autorizado de cache",
    (status) => {
      const request = guard.begin({ token: "token-a", applicationId: 7 });
      const concurrent = guard.begin({ token: "token-a", applicationId: 7 });
      expect(guard.resolve(request, { status, context: authorized() })).toBeNull();
      expect(guard.resolve(concurrent, { status: 200, context: authorized() })).toBeNull();
    },
  );

  test("erro de sessão antiga não revoga sessão nova", () => {
    const previous = guard.begin({ token: "antigo", applicationId: 7 });
    const current = guard.begin({ token: "novo", applicationId: 7 });
    expect(guard.resolve(previous, { status: 403, context: authorized() })).toBeNull();
    expect(guard.resolve(current, { status: 200, context: authorized() })).toEqual(authorized());
  });
});
