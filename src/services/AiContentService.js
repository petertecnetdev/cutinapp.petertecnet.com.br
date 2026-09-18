import apiClient from "./ApiClient";

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

    try {
      const response = await apiClient.post("/ai/content/description", payload, { timeout: 80000 });
      const description = cleanString(response?.data?.description, 10000);

      if (!description) {
        throw new Error("A IA não retornou uma descrição utilizável.");
      }

      return {
        ...response.data,
        description,
      };
    } catch (primaryError) {
      // Compatibility path while older API deployments still expose the
      // creative-text endpoint. This keeps the editor functional during
      // rolling frontend/API deployments instead of surfacing a generic 5xx.
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
        const response = await apiClient.post(
          "/v1/apps/cutinapp/creative/texts",
          legacyPayload,
          { timeout: 80000 },
        );
        const data = response?.data?.data || response?.data || {};
        const description = cleanString(
          data.description || data.text || data.content || data.result,
          10000,
        );

        if (!description) throw primaryError;

        return {
          ...data,
          description,
          meta: {
            ...(data.meta || {}),
            compatibility_endpoint: true,
          },
        };
      } catch (_) {
        throw primaryError;
      }
    }
  }
}

const aiContentService = new AiContentService();
export default aiContentService;
