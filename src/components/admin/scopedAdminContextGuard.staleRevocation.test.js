import { createScopedAdminContextGuard } from "./scopedAdminContextGuard";

const autorizado = (application_id = 7) => ({ authorized: true, application_id });

describe("Administrator: revogações antigas não atingem sessão retomada", () => {
  test.each([401, 403])(
    "HTTP %i da primeira sessão A não revoga a sessão A recriada após A→B→A",
    (status) => {
      const guard = createScopedAdminContextGuard();
      const antigoA = guard.begin({ token: "token-compartilhado", applicationId: 7 });
      guard.begin({ token: "token-compartilhado", applicationId: 8 });
      const novoA = guard.begin({ token: "token-compartilhado", applicationId: 7 });

      expect(guard.resolve(antigoA, { status, context: autorizado(7) })).toBeNull();
      expect(guard.resolve(novoA, { status: 200, context: autorizado(7) }))
        .toEqual(autorizado(7));
    },
  );

  test.each([401, 403])(
    "HTTP %i do login anterior não revoga novo login com o mesmo token",
    (status) => {
      const guard = createScopedAdminContextGuard();
      const anterior = guard.begin({ token: "token-reutilizado", applicationId: 7 });
      expect(guard.begin({ token: null, applicationId: 7 })).toBeNull();
      const atual = guard.begin({ token: "token-reutilizado", applicationId: 7 });

      expect(guard.resolve(anterior, { status, context: autorizado(7) })).toBeNull();
      expect(guard.resolve(atual, { status: 200, context: autorizado(7) }))
        .toEqual(autorizado(7));
    },
  );

  test("contexto adulterado de A antigo não revoga A atual após troca por B", () => {
    const guard = createScopedAdminContextGuard();
    const antigoA = guard.begin({ token: "compartilhado", applicationId: 7 });
    guard.begin({ token: "compartilhado", applicationId: 8 });
    const novoA = guard.begin({ token: "compartilhado", applicationId: 7 });

    expect(guard.resolve(antigoA, { status: 200, context: autorizado(8) })).toBeNull();
    expect(guard.resolve(novoA, { status: 200, context: autorizado(7) }))
      .toEqual(autorizado(7));
  });
});
