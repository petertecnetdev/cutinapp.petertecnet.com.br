import { resolveCuratorialReadScopeW4 } from "./curatorialAccessPolicyW4";

const context = (extra = {}) => ({
  authorized: true,
  application_id: 7,
  permissions: ["operations.view"],
  is_owner: false,
  ...extra,
});

describe("W4: autoridade de leitura da curadoria por aplicação", () => {
  test("proprietário local com is_root inconsistente nunca vira root global", () => {
    expect(resolveCuratorialReadScopeW4(context({ is_owner: true, is_root: true }), 7))
      .toEqual({ canView: true, role: "Administrador da aplicação", scope: "application" });
  });

  test.each([
    ["sem autorização", { authorized: false }],
    ["somente root declarado", { authorized: false, is_root: true, is_owner: true }],
    ["outro aplicativo", { application_id: 8, is_owner: true, is_root: true }],
    ["sem permissão", { permissions: [], is_owner: true, is_root: true }],
    ["permissões malformadas", { permissions: "operations.view" }],
    ["ID não informado", { application_id: null }],
  ])("nega %s mesmo diante de flags elevadas", (_name, extra) => {
    expect(resolveCuratorialReadScopeW4(context(extra), 7))
      .toEqual({ canView: false, role: null, scope: null });
  });

  test.each([0, "07", "9223372036854775808", 9007199254740992, null])(
    "nega applicationId não canônico ou inseguro: %p", (id) => {
      expect(resolveCuratorialReadScopeW4(context(), id).canView).toBe(false);
    },
  );

  test("colaborador com operations.view explícito tem somente escopo da aplicação", () => {
    expect(resolveCuratorialReadScopeW4(context({ is_root: true }), "7"))
      .toEqual({ canView: true, role: "Colaborador autorizado", scope: "application" });
  });

  test("ID inteiro de 64 bits preservado em string sem perda de precisão", () => {
    const id = "9223372036854775807";
    expect(resolveCuratorialReadScopeW4(context({ application_id: id }), id).canView).toBe(true);
  });
});
