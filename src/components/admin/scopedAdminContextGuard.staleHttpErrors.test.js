import { createScopedAdminContextGuard } from "./scopedAdminContextGuard";

const authorized = (application_id) => ({
  authorized: true,
  application_id,
  permissions: ["users.view"],
});

describe("Administrator: falhas HTTP antigas não revogam sessão A retomada", () => {
  test.each([429, 500])(
    "HTTP %i de A anterior após A→B→A não invalida requisições da sessão atual",
    (status) => {
      const guard = createScopedAdminContextGuard();
      const previousA = guard.begin({ token: "token-compartilhado", applicationId: 7 });
      guard.begin({ token: "token-compartilhado", applicationId: 8 });
      const currentA = guard.begin({ token: "token-compartilhado", applicationId: 7 });
      const concurrentA = guard.begin({ token: "token-compartilhado", applicationId: 7 });

      expect(guard.resolve(previousA, { status, context: authorized(7) })).toBeNull();
      expect(guard.resolve(currentA, { status: 200, context: authorized(7) }))
        .toEqual(authorized(7));
      expect(guard.resolve(concurrentA, { status: 200, context: authorized(7) }))
        .toEqual(authorized(7));
    },
  );
});
