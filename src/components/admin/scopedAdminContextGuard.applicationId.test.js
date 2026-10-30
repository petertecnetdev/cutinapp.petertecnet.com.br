import { createScopedAdminContextGuard } from "./scopedAdminContextGuard";

const context = (application_id) => ({ authorized: true, application_id });

describe("Administrator: application_id canônico e precisão de 64 bits", () => {
  test.each(["9007199254740993", "9223372036854775807"])(
    "preserva ID de 64 bits recebido como string: %s", (applicationId) => {
      const guard = createScopedAdminContextGuard();
      const ticket = guard.begin({ token: "delegado", applicationId });
      expect(ticket).not.toBeNull();
      expect(guard.resolve(ticket, { status: 200, context: context(applicationId) }))
        .toEqual(context(applicationId));
    },
  );

  test.each([9007199254740992, 9223372036854776000, "9223372036854775808", "18446744073709551615", "0007", true, {}, []])(
    "nega applicationId inseguro ou não canônico: %p", (applicationId) => {
      const guard = createScopedAdminContextGuard();
      expect(guard.begin({ token: "delegado", applicationId })).toBeNull();
    },
  );

  test.each([9007199254740992, "9223372036854775808", "0007", {}, true])(
    "nega application_id inesperado na resposta: %p", (applicationId) => {
      const guard = createScopedAdminContextGuard();
      const ticket = guard.begin({ token: "delegado", applicationId: 7 });
      expect(guard.resolve(ticket, { status: 200, context: context(applicationId) })).toBeNull();
    },
  );

  test("erro tardio de sessão anterior não revoga ticket atual", () => {
    const guard = createScopedAdminContextGuard();
    const antigo = guard.begin({ token: "anterior", applicationId: 7 });
    const atual = guard.begin({ token: "atual", applicationId: 7 });
    expect(guard.resolve(antigo, { status: 403, context: context(7) })).toBeNull();
    expect(guard.resolve(atual, { status: 200, context: context(7) })).toEqual(context(7));
  });
});
