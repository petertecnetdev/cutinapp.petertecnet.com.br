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
  } = {}) {
    const payload = {
      entity_type: cleanString(entityType, 50).replace(/[^a-zA-Z0-9_-]+/g, "-") || "generic",
      title: cleanString(title, 200) || undefined,
      current_description: cleanString(currentDescription, 5000) || undefined,
      context: sanitizeContext(context),
      locale: cleanString(locale, 10) || "pt-BR",
      tone: cleanString(tone, 160),
    };

    const response = await apiClient.post("/ai/content/description", payload, { timeout: 50000 });
    const description = cleanString(response?.data?.description, 10000);

    if (!description) {
      throw new Error("A IA não retornou uma descrição utilizável.");
    }

    return {
      ...response.data,
      description,
    };
  }
}

const aiContentService = new AiContentService();
export default aiContentService;
