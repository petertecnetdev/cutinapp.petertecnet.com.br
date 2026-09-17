const DEFAULT_CATEGORIES = [
  { key: "payment", priority: 5, patterns: [/pagamento/i, /cobran[cç]a/i, /cart[aã]o/i, /pix/i, /estorno/i] },
  { key: "access", priority: 4, patterns: [/login/i, /senha/i, /acesso/i, /entrar/i, /c[oó]digo/i] },
  { key: "bug", priority: 3, patterns: [/erro/i, /falha/i, /travou/i, /bug/i, /n[aã]o funciona/i] },
  { key: "performance", priority: 2, patterns: [/lento/i, /demora/i, /carregamento/i, /travando/i] },
  { key: "content", priority: 1, patterns: [/descri[cç][aã]o/i, /categoria/i, /evento/i, /perfil/i] },
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const normalizeFeedbackText = (value) => String(value || "")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 2000);

export const classifyFeedback = (value, categories = DEFAULT_CATEGORIES) => {
  const text = normalizeFeedbackText(value);
  if (!text) {
    return {
      category: "unknown",
      priority: 0,
      confidence: 0,
      matched_terms: [],
      requires_human_review: true,
    };
  }

  const matches = categories.map((category) => ({
    ...category,
    matched_terms: category.patterns
      .filter((pattern) => pattern.test(text))
      .map((pattern) => pattern.source),
  })).filter((category) => category.matched_terms.length > 0);

  if (!matches.length) {
    return {
      category: "other",
      priority: 1,
      confidence: 0.2,
      matched_terms: [],
      requires_human_review: true,
    };
  }

  const winner = matches.sort((left, right) => {
    if (right.matched_terms.length !== left.matched_terms.length) return right.matched_terms.length - left.matched_terms.length;
    return right.priority - left.priority;
  })[0];

  const confidence = clamp(0.45 + (winner.matched_terms.length * 0.2), 0, 0.95);
  return {
    category: winner.key,
    priority: winner.priority,
    confidence,
    matched_terms: winner.matched_terms,
    requires_human_review: confidence < 0.7 || winner.key === "payment",
  };
};

export const createFeedbackAutomationProvider = ({ classify = classifyFeedback } = {}) => ({
  async classify(input, { timeoutMs = 1500 } = {}) {
    const startedAt = Date.now();
    const result = await Promise.race([
      Promise.resolve().then(() => classify(input)),
      new Promise((_, reject) => setTimeout(() => reject(new Error("feedback_classification_timeout")), timeoutMs)),
    ]);
    return {
      ...result,
      latency_ms: Date.now() - startedAt,
      provider: "deterministic-local",
    };
  },
});

export const DEFAULT_FEEDBACK_CATEGORIES = DEFAULT_CATEGORIES.map(({ key, priority }) => ({ key, priority }));
