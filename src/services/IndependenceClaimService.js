import appApiClient from "./AppApiClient";
import { appSlug } from "../config";
import { getAuthToken } from "../utils/authTokenStorage";
import { canonicalAppId, canonicalPositiveDecimalId } from "../utils/independenceAppId";

// A identidade, a aplicação e a autorização são sempre decididas pela API.
// Este preflight é uma barreira adicional de UX, não substitui a política do POST.
const safeError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};
const sessionChanged = () => safeError(409, "A sessão mudou. Reabra a solicitação e tente novamente.");
const normalizedEmail = (value) => typeof value === "string" ? value.trim().toLowerCase() : "";

// Detecta invalidação e trocas de token entre abas, inclusive A→B→A. Trocas
// síncronas na mesma aba sem evento não podem ser observadas sem o epoch do
// módulo de autenticação (que possui outro owner); também comparamos o token
// capturado antes/depois de cada await e antes de enviar qualquer POST.
const watchSession = (token) => {
  let invalidated = false;
  const onStorage = (event) => {
    if (event?.key === "token") invalidated = true;
  };
  const onInvalidated = () => { invalidated = true; };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    window.addEventListener("petertecnet:auth-invalidated", onInvalidated);
  }
  return {
    isCurrent: () => !invalidated && Boolean(token) && getAuthToken() === token,
    dispose: () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("petertecnet:auth-invalidated", onInvalidated);
      }
    },
  };
};

const independenceClaimService = {
  async submit({
    entityType, entityId, applicationId, userId, name, email, phone, message, consent,
  }) {
    const normalizedEntityId = canonicalPositiveDecimalId(entityId);
    if (!normalizedEntityId) throw new TypeError("Identificador da entidade inválido.");
    if (!["event", "production", "artist"].includes(entityType)) {
      throw new TypeError("Tipo de entidade inválido.");
    }

    // Os IDs esperados vêm da ficha e do contexto React, nunca de privilégios
    // enviados no payload. IDs ausentes/conflitantes impedem até o preflight.
    const expectedAppId = canonicalAppId(applicationId);
    const expectedUserId = canonicalPositiveDecimalId(userId);
    const expectedEmail = normalizedEmail(email);
    if (!expectedAppId || !expectedUserId || !expectedEmail || consent !== true) {
      throw safeError(403, "Não foi possível confirmar sua sessão e a aplicação desta ficha.");
    }
    const token = getAuthToken();
    if (!token) throw safeError(401, "Entre novamente para solicitar a análise.");

    const session = watchSession(token);
    // A sinalização impede compartilhar um GET /me em voo entre duas contas:
    // ApiClient deduplica GETs sem signal apenas por URL/parâmetros.
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    try {
      let preflight;
      try {
        preflight = await appApiClient.get("/me", controller ? { signal: controller.signal } : {});
      } catch (error) {
        if (!session.isCurrent()) throw sessionChanged();
        const status = Number(error?.status || error?.response?.status || 0);
        if (status === 401 || status === 403) {
          throw safeError(status, status === 401
            ? "Sua sessão expirou. Entre novamente para solicitar a análise."
            : "Você não tem autorização para enviar esta solicitação.");
        }
        throw safeError(503, "Não foi possível confirmar a sessão. Tente novamente.");
      }
      if (!session.isCurrent()) throw sessionChanged();

      const application = preflight?.data?.data?.application;
      const user = preflight?.data?.data?.user;
      if (canonicalAppId(application?.id) !== expectedAppId
        || application?.slug !== appSlug
        || canonicalPositiveDecimalId(user?.id) !== expectedUserId
        || normalizedEmail(user?.email) !== expectedEmail) {
        throw safeError(403, "A conta autenticada não corresponde à aplicação ou à ficha.");
      }
      if (!session.isCurrent()) throw sessionChanged();

      // A API deriva app/user do Bearer e revalida o vínculo no POST.
      // Não transmitir app_id, user_id, status ou flags de comércio do cliente.
      let response;
      try {
        response = await appApiClient.post("/independence/claims", {
          entity_type: entityType,
          entity_id: normalizedEntityId,
          name: String(name || "").trim(),
          email: String(user.email).trim(),
          phone: String(phone || "").trim() || null,
          message: String(message || "").trim() || null,
          consent: true,
        });
      } catch (error) {
        if (!session.isCurrent()) throw sessionChanged();
        const status = Number(error?.status || error?.response?.status || 0);
        if (status === 401 || status === 403) {
          throw safeError(status, status === 401
            ? "Sua sessão expirou. Entre novamente para solicitar a análise."
            : "Você não tem autorização para enviar esta solicitação.");
        }
        throw safeError(status || 503, "Não foi possível enviar a solicitação. Tente novamente.");
      }
      // Uma resposta atrasada de A não deve atualizar a interface de B (ou A
      // restaurada após um evento de troca). Isso não desfaz POST já recebido.
      if (!session.isCurrent()) throw sessionChanged();
      // A API responde { success: true, data: { status: "pending" } }.
      // HTTP 2xx sem recibo válido ou "approved" no intake NÃO é aprovação.
      const receipt = response?.data;
      const status = receipt?.data?.status ?? receipt?.status;
      if (receipt?.success === false || !["pending", "pending_claim", "duplicate"].includes(status)) {
        throw safeError(502, "Não foi possível confirmar o registro da solicitação.");
      }
      return { status, message: "Solicitação registrada para revisão." };
    } finally {
      controller?.abort();
      session.dispose();
    }
  },
  async mine() {
    const response = await appApiClient.get("/independence/claims/mine");
    return response.data?.data;
  },
};
export default independenceClaimService;
