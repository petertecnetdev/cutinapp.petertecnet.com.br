/**
 * Contrato de VISIBILIDADE da curadoria por aplicação, sem conceder privilégios.
 * A API é a única autoridade para autorização, isolamento e operações comerciais.
 * Nunca inferir root global a partir de is_root de um contexto por aplicação.
 */
const MAX_APP_ID = "9223372036854775807";

const appIdKey = (value) => {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  if (value.length > MAX_APP_ID.length ||
      (value.length === MAX_APP_ID.length && value > MAX_APP_ID)) return null;
  return value;
};

const DENIED = Object.freeze({ canView: false, role: null, scope: null });

export const resolveCuratorialReadScopeW4 = (context, expectedApplicationId) => {
  const expected = appIdKey(expectedApplicationId);
  if (!expected || !context || context.authorized !== true ||
      appIdKey(context.application_id) !== expected ||
      !Array.isArray(context.permissions) ||
      !context.permissions.includes("operations.view")) {
    return DENIED;
  }

  // is_owner identifica titularidade local apenas para apresentação; NÃO concede
  // operations.view e NÃO significa root do ecossistema, mesmo com is_root=true.
  return Object.freeze({
    canView: true,
    role: context.is_owner === true ? "Administrador da aplicação" : "Colaborador autorizado",
    scope: "application",
  });
};
