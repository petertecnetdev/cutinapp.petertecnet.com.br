import { createScopedAdminContextGuard } from "./scopedAdminContextGuard";

const autorizado = (application_id) => ({
  authorized: true,
  application_id,
  permissions: ["users.view"],
});

describe("Administrator: revogação antiga após troca conjunta de usuário e aplicação", () => {
  test.each([401, 403])(
    "HTTP %i da conta anterior em outro app não cancela duas consultas atuais",
    (status) => {
      const guard = createScopedAdminContextGuard();
      const anterior = guard.begin({ token: "usuario-antigo", applicationId: 7 });
      const atual = guard.begin({ token: "usuario-novo", applicationId: 8 });
      const concorrente = guard.begin({ token: "usuario-novo", applicationId: 8 });

      expect(guard.resolve(anterior, { status, context: autorizado(7) })).toBeNull();
      expect(guard.resolve(atual, { status: 200, context: autorizado(8) }))
        .toEqual(autorizado(8));
      expect(guard.resolve(concorrente, { status: 200, context: autorizado(8) }))
        .toEqual(autorizado(8));
    },
  );

  test.each([401, 403])(
    "HTTP %i em instância anterior não contamina guard independente de outro app",
    (status) => {
      const anterior = createScopedAdminContextGuard();
      const atual = createScopedAdminContextGuard();
      const ticketAntigo = anterior.begin({ token: "usuario-antigo", applicationId: 7 });
      const ticketAtual = atual.begin({ token: "usuario-novo", applicationId: 8 });

      expect(anterior.resolve(ticketAntigo, { status, context: autorizado(7) })).toBeNull();
      expect(atual.resolve(ticketAtual, { status: 200, context: autorizado(8) }))
        .toEqual(autorizado(8));
    },
  );
});
