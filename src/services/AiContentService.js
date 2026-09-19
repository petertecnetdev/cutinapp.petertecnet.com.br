import apiClient from "./ApiClient";
import appApiClient from "./AppApiClient";

const cleanString = (value, maxLength) => String(value ?? "").trim().slice(0, maxLength);

const sanitizeContext = (context) => Object.entries(context || {})
  .slice(0, 30)
  .reduce((result, [key, value]) => {
    if (value === null || value === undefined) return result;
    const stringValue = cleanString(value, 500);
    if (!stringValue) return result;
    result[cleanString(key, 80)] = stringValue;
    return result;
  }, {});

const extractDescription = (response) => {
  const data = response?.data?.data || response?.data || {};
  const description = cleanString(
    data.description || data.text || data.content || data.result,
    10000,
  );

  return { data, description };
};

class AiContentService {
  async generateDescription({
    entityType = "generic",
    title = "",
    currentDescription = "",
    context = {},
    locale = "pt-BR",
    tone = "profissional, natural, convidativo e objetivo",
    action = "improve",
  } = {}) {
    const payload = {
      entity_type: cleanString(entityType, 50).replace(/[^a-zA-Z0-9_-]+/g, "-") || "generic",
      title: cleanString(title, 200) || undefined,
      current_description: cleanString(currentDescription, 5000) || undefined,
      context: sanitizeContext(context),
      locale: cleanString(locale, 10) || "pt-BR",
      tone: cleanString(tone, 220),
      action: ["improve", "rewrite", "enrich"].includes(action) ? action : "improve",
    };

    let primaryError;

    try {
      const response = await apiClient.post("/ai/content/description", payload, { timeout: 80000 });
      const { data, description } = extractDescription(response);

      if (!description) {
        throw new Error("A IA não retornou uma descrição utilizável.");
      }

      return {
        ...data,
        description,
      };
    } catch (error) {
      primaryError = error;
    }

    // If the advanced event pipeline is temporarily unavailable (for example
    // during a rolling deploy or before its persistence migration is applied),
    // retry through the generic description path. The same backend endpoint
    // bypasses the event-specific pipeline when entity_type is generic.
    if (payload.entity_type === "event") {
      try {
        const response = await apiClient.post(
          "/ai/content/description",
          {
            ...payload,
            entity_type: "generic",
            context: {
              ...payload.context,
              original_entity_type: "event",
            },
          },
          { timeout: 80000 },
        );
        const { data, description } = extractDescription(response);

        if (description) {
          return {
            ...data,
            description,
            meta: {
              ...(data.meta || {}),
              event_pipeline_fallback: true,
            },
          };
        }
      } catch (_) {
        // Continue to the compatibility endpoint below.
      }
    }

    // Compatibility path for an older API deployment that still exposes the
    // app-scoped creative-text capability while /ai/content/description rolls out.
    // AppApiClient owns /api/v1/apps/{application}, keeping this service generic.
    try {
      const legacyPayload = {
        purpose: "event_description",
        entity_type: payload.entity_type,
        title: payload.title,
        description: payload.current_description,
        context: payload.context,
        locale: payload.locale,
        tone: payload.tone,
        action: payload.action,
      };
      const response = await appApiClient.post(
        "/creative/texts",
        legacyPayload,
        { timeout: 80000 },
      );
      const { data, description } = extractDescription(response);

      if (description) {
        return {
          ...data,
          description,
          meta: {
            ...(data.meta || {}),
            compatibility_endpoint: true,
          },
        };
      }
    } catch (_) {
      // Preserve the original error because it best represents the failed path.
    }

    throw primaryError;
  }
}

const aiContentService = new AiContentService();
export default aiContentService;
