import appApiClient from "./AppApiClient";
import { canonicalPositiveDecimalId } from "../utils/independenceAppId";

// The server derives the app scope, user identity and claim status.
const independenceClaimService = {
  async submit({ entityType, entityId, name, email, phone, message, consent }) {
    const normalizedEntityId = canonicalPositiveDecimalId(entityId);
    if (!normalizedEntityId) {
      throw new TypeError("Identificador da entidade inválido.");
    }

    const response = await appApiClient.post("/independence/claims", {
      entity_type: entityType,
      entity_id: normalizedEntityId,
      name: String(name || "").trim(),
      email: String(email || "").trim(),
      phone: String(phone || "").trim() || null,
      message: String(message || "").trim() || null,
      consent: consent === true,
    });
    return response.data;
  },
  async mine() {
    const response = await appApiClient.get("/independence/claims/mine");
    return response.data?.data;
  },
};
export default independenceClaimService;
