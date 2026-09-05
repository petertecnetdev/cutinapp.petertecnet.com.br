const CATEGORY_WORDS = new Set([
  "aperitivos", "bebida", "bebidas", "cerveja", "cervejas", "chopp", "chopps",
  "combo", "combos", "comida", "comidas", "drink", "drinks", "entrada", "entradas",
  "hamburguer", "hamburgueres", "hamburgueres artesanais", "lanche", "lanches", "massas",
  "petisco", "petiscos", "pizza", "pizzas", "porcao", "porcoes", "prato", "pratos",
  "pratos principais", "refeicao", "refeicoes", "sanduiche", "sanduiches", "servico",
  "servicos", "sobremesa", "sobremesas", "suco", "sucos", "vinho", "vinhos",
  "agua", "aguas", "cafes", "cafe", "doces", "especiais", "promocoes",
]);

const NOISE_PATTERNS = [
  /\b(?:whats?app|instagram|facebook|ifood|delivery|telefone|tel\.?|endereco|endereço)\b/i,
  /(?:^|\s)@\w+/,
  /\b(?:pix|cnpj|cpf)\b/i,
  /\b\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/,
  /^https?:\/\//i,
  /^www\./i,
];

const VARIANT_LABELS = new Set([
  "p", "m", "g", "gg", "pequena", "pequeno", "media", "medio", "grande", "individual",
  "familia", "mini", "broto", "inteira", "meia", "unidade", "dupla",
]);

const normalizeAscii = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase();

const normalizeWhitespace = (value) => String(value || "")
  .replace(/[\t\u00a0]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const cleanLabel = (value) => normalizeWhitespace(String(value || "")
  .replace(/[.…·_]{2,}/g, " ")
  .replace(/(?:\.{2,}|-{3,})/g, " ")
  .replace(/^[|/,:;\-–—]+|[|/,:;\-–—]+$/g, " "));

export const normalizeComparableName = (value) => normalizeAscii(value)
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(\d+)\s+(ml|l|kg|g)\b/g, "$1$2")
  .replace(/\s+/g, " ")
  .trim();

const priceRegex = /(?:R\s*\$|R\$|RS|R\s*S)?\s*(\d{1,4})\s*([.,])\s*(\d{2})(?!\d)/gi;
const currencyIntegerRegex = /(?:R\s*\$|R\$|RS|R\s*S)\s*(\d{1,4})(?![\d.,])/gi;

function extractPrices(line) {
  const source = String(line || "");
  const matches = [];
  let match;

  priceRegex.lastIndex = 0;
  while ((match = priceRegex.exec(source)) !== null) {
    matches.push({
      index: match.index,
      end: priceRegex.lastIndex,
      raw: match[0],
      value: Number(`${match[1]}.${match[3]}`),
    });
  }

  if (!matches.length) {
    currencyIntegerRegex.lastIndex = 0;
    while ((match = currencyIntegerRegex.exec(source)) !== null) {
      matches.push({
        index: match.index,
        end: currencyIntegerRegex.lastIndex,
        raw: match[0],
        value: Number(match[1]),
      });
    }
  }

  return matches.filter((entry) => Number.isFinite(entry.value) && entry.value >= 0);
}

function knownCategory(line) {
  const normalized = normalizeComparableName(line.replace(/:$/, ""));
  return Boolean(normalized && CATEGORY_WORDS.has(normalized));
}

function isLikelyCategory(line) {
  const cleaned = cleanLabel(line);
  if (!cleaned || extractPrices(cleaned).length) return false;
  if (knownCategory(cleaned)) return true;
  if (cleaned.endsWith(":")) return cleaned.split(/\s+/).length <= 5;
  return false;
}

function isNoiseLine(line) {
  const cleaned = normalizeWhitespace(line);
  if (!cleaned) return true;
  return NOISE_PATTERNS.some((pattern) => pattern.test(cleaned));
}

function confidenceScore(ocrConfidence, parserConfidence = 1) {
  const raw = Number(ocrConfidence);
  const ocr = Number.isFinite(raw) && raw > 0 ? Math.min(1, raw / 100) : 0.72;
  return Math.round(Math.min(0.99, Math.max(0.35, ocr * parserConfidence)) * 1000) / 1000;
}

function canonicalVariant(value) {
  const normalized = normalizeComparableName(value);
  const compact = normalized.replace(/\s+/g, "");
  if (/^\d+ml$/.test(compact)) return compact;
  if (/^\d+l$/.test(compact)) return `${compact.slice(0, -1)}L`;
  if (normalized === "media") return "Média";
  if (normalized === "medio") return "Médio";
  if (normalized === "pequena") return "Pequena";
  if (normalized === "pequeno") return "Pequeno";
  if (normalized === "grande") return "Grande";
  if (normalized === "familia") return "Família";
  if (["p", "m", "g", "gg"].includes(normalized)) return normalized.toUpperCase();
  return cleanLabel(value);
}

function splitTrailingVariant(label) {
  const cleaned = cleanLabel(label);
  if (!cleaned) return null;
  const words = cleaned.split(/\s+/);
  const last = words[words.length - 1];
  const lastNormalized = normalizeComparableName(last);

  if (VARIANT_LABELS.has(lastNormalized)) {
    return {
      base: cleanLabel(words.slice(0, -1).join(" ")),
      variant: canonicalVariant(last),
    };
  }

  const volumeMatch = cleaned.match(/(?:^|\s)(\d+(?:[.,]\d+)?\s*(?:ml|l))$/i);
  if (volumeMatch) {
    return {
      base: cleanLabel(cleaned.slice(0, volumeMatch.index)),
      variant: canonicalVariant(volumeMatch[1].replace(/\s+/g, "")),
      inlineVariant: true,
    };
  }

  return null;
}

function combineVariantName(base, variant, inlineVariant = false) {
  const cleanBase = cleanLabel(base);
  const cleanVariant = canonicalVariant(variant);
  if (!cleanBase) return cleanVariant;
  if (!cleanVariant) return cleanBase;
  return inlineVariant ? `${cleanBase} ${cleanVariant}` : `${cleanBase} - ${cleanVariant}`;
}

function parseMultiplePriceLine(line, prices, pending, category, ocrConfidence) {
  if (prices.length < 2) return null;

  let cursor = 0;
  let baseName = "";
  const variants = [];

  for (let index = 0; index < prices.length; index += 1) {
    const price = prices[index];
    const segment = cleanLabel(line.slice(cursor, price.index));
    cursor = price.end;
    const split = splitTrailingVariant(segment);

    if (index === 0) {
      if (!split) return null;
      baseName = split.base || cleanLabel(pending[0] || "");
      if (!baseName) return null;
      variants.push({ variant: split.variant, inlineVariant: split.inlineVariant, price: price.value });
      continue;
    }

    const variantOnly = split && !split.base ? split : null;
    const direct = normalizeComparableName(segment);
    if (variantOnly) {
      variants.push({ variant: variantOnly.variant, inlineVariant: variantOnly.inlineVariant, price: price.value });
    } else if (VARIANT_LABELS.has(direct) || /^\d+(?:ml|l)$/.test(direct.replace(/\s+/g, ""))) {
      variants.push({ variant: canonicalVariant(segment), inlineVariant: /(?:ml|l)$/i.test(segment), price: price.value });
    } else {
      return null;
    }
  }

  const description = pending.length > 1 ? cleanLabel(pending.slice(1).join(" ")) : null;
  return variants.map((entry) => ({
    name: combineVariantName(baseName, entry.variant, entry.inlineVariant),
    description,
    price: entry.price,
    category: category || null,
    subcategory: null,
    brand: null,
    sku: null,
    type: "product",
    confidence: confidenceScore(ocrConfidence, 0.94),
    source_text: normalizeWhitespace(line),
  }));
}

function createItem({ name, description = null, price, category, confidence, sourceText }) {
  return {
    name: cleanLabel(name),
    description: cleanLabel(description) || null,
    price: Number(price),
    category: category || null,
    subcategory: null,
    brand: null,
    sku: null,
    type: "product",
    confidence,
    source_text: normalizeWhitespace(sourceText) || null,
  };
}

function appendDescription(item, lines) {
  if (!item || !lines.length) return;
  const description = cleanLabel(lines.filter((line) => !isNoiseLine(line)).join(" "));
  if (!description) return;
  item.description = item.description ? `${item.description} ${description}` : description;
}

export function parseMenuText(text, { confidence = 72 } = {}) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(normalizeWhitespace)
    .filter(Boolean);

  const items = [];
  const warnings = [];
  let category = null;
  let pending = [];
  let lastItemIndex = -1;
  let activeVariantParent = null;

  const flushPendingAsDescription = () => {
    if (pending.length && lastItemIndex >= 0) appendDescription(items[lastItemIndex], pending);
    pending = [];
  };

  lines.forEach((line) => {
    if (isNoiseLine(line)) return;

    if (isLikelyCategory(line)) {
      flushPendingAsDescription();
      activeVariantParent = null;
      category = cleanLabel(line.replace(/:$/, ""));
      return;
    }

    const prices = extractPrices(line);
    if (!prices.length) {
      activeVariantParent = null;
      pending.push(line);
      return;
    }

    const multi = parseMultiplePriceLine(line, prices, pending, category, confidence);
    if (multi) {
      if (lastItemIndex >= 0 && pending.length > 1) appendDescription(items[lastItemIndex], pending.slice(0, -1));
      pending = [];
      activeVariantParent = null;
      multi.forEach((item) => {
        items.push(item);
        lastItemIndex = items.length - 1;
      });
      return;
    }

    const price = prices[0];
    const beforePrice = cleanLabel(line.slice(0, price.index));
    const afterPrice = cleanLabel(line.slice(price.end));
    const trailingVariant = splitTrailingVariant(beforePrice);

    if (trailingVariant && !trailingVariant.base && (pending.length || activeVariantParent)) {
      const parent = pending.length
        ? cleanLabel(pending[pending.length - 1])
        : cleanLabel(activeVariantParent);
      if (pending.length > 1 && lastItemIndex >= 0) appendDescription(items[lastItemIndex], pending.slice(0, -1));
      pending = [];
      activeVariantParent = parent;
      items.push(createItem({
        name: combineVariantName(parent, trailingVariant.variant, trailingVariant.inlineVariant),
        price: price.value,
        category,
        confidence: confidenceScore(confidence, 0.92),
        sourceText: line,
      }));
      lastItemIndex = items.length - 1;
      return;
    }

    if (beforePrice) {
      activeVariantParent = null;
      if (pending.length && lastItemIndex >= 0) appendDescription(items[lastItemIndex], pending);
      pending = [];
      const split = splitTrailingVariant(beforePrice);
      const name = split && split.base
        ? combineVariantName(split.base, split.variant, split.inlineVariant)
        : beforePrice;
      items.push(createItem({
        name,
        description: afterPrice || null,
        price: price.value,
        category,
        confidence: confidenceScore(confidence, 0.97),
        sourceText: line,
      }));
      lastItemIndex = items.length - 1;
      return;
    }

    if (pending.length) {
      activeVariantParent = null;
      const [name, ...description] = pending;
      pending = [];
      items.push(createItem({
        name,
        description: [...description, afterPrice].filter(Boolean).join(" "),
        price: price.value,
        category,
        confidence: confidenceScore(confidence, 0.88),
        sourceText: line,
      }));
      lastItemIndex = items.length - 1;
      return;
    }

    warnings.push(`Preço encontrado sem nome associado: ${normalizeWhitespace(line)}`);
  });

  flushPendingAsDescription();
  const usable = items.filter((item) => item.name && Number.isFinite(item.price));
  if (!usable.length && lines.length) {
    warnings.push("O texto foi reconhecido, mas não encontramos pares claros de nome e preço. Revise a foto ou tente uma imagem mais nítida.");
  }
  return { items: usable, warnings };
}

function bigrams(value) {
  const normalized = normalizeComparableName(value).replace(/\s+/g, " ");
  if (normalized.length < 2) return [normalized];
  const result = [];
  for (let index = 0; index < normalized.length - 1; index += 1) result.push(normalized.slice(index, index + 2));
  return result;
}

export function diceSimilarity(a, b) {
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left[0] && !right[0]) return 1;
  if (!left.length || !right.length) return 0;

  const counts = new Map();
  left.forEach((pair) => counts.set(pair, (counts.get(pair) || 0) + 1));
  let overlap = 0;
  right.forEach((pair) => {
    const count = counts.get(pair) || 0;
    if (count > 0) {
      overlap += 1;
      counts.set(pair, count - 1);
    }
  });
  return (2 * overlap) / (left.length + right.length);
}

function priceClose(a, b) {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= 0.05;
}

export function findDuplicateCandidate(item, existingItems = []) {
  const needle = normalizeComparableName(item?.name);
  if (!needle) return null;

  let best = null;
  let bestScore = 0;
  existingItems.forEach((existing) => {
    const candidate = normalizeComparableName(existing?.name);
    if (!candidate) return;
    const score = candidate === needle ? 1 : diceSimilarity(needle, candidate);
    const qualifies = score === 1
      || (score >= 0.96 && priceClose(item?.price, existing?.price))
      || score >= 0.985;
    if (qualifies && score > bestScore) {
      best = existing;
      bestScore = score;
    }
  });

  if (!best) return null;
  return {
    id: best.id,
    name: best.name,
    price: best.price === null || best.price === undefined ? null : Number(best.price),
    category: best.category || null,
    status: best.status !== false,
    match_score: Math.round(bestScore * 1000) / 1000,
  };
}

function dedupeDetectedItems(items) {
  const map = new Map();
  items.forEach((item) => {
    const key = `${normalizeComparableName(item.name)}::${Number(item.price).toFixed(2)}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...item });
      return;
    }
    if ((!current.description || current.description.length < (item.description || "").length) && item.description) {
      current.description = item.description;
    }
    current.confidence = Math.max(Number(current.confidence || 0), Number(item.confidence || 0));
  });
  return Array.from(map.values());
}

export function parseMenuDocuments(documents = [], existingItems = []) {
  const allItems = [];
  const warnings = [];
  const rawSections = [];

  documents.forEach((document, index) => {
    const text = String(document?.text || "").trim();
    const name = document?.name || `Imagem ${index + 1}`;
    if (!text) {
      warnings.push(`${name}: nenhum texto reconhecido.`);
      return;
    }

    rawSections.push(`--- ${name} ---\n${text}`);
    const parsed = parseMenuText(text, { confidence: document?.confidence });
    allItems.push(...parsed.items);
    warnings.push(...parsed.warnings.map((warning) => `${name}: ${warning}`));
  });

  const deduped = dedupeDetectedItems(allItems).map((item) => {
    const duplicate = findDuplicateCandidate(item, existingItems);
    return {
      ...item,
      duplicate,
      recommended_action: duplicate ? "skip" : "create",
    };
  });

  const lowConfidence = deduped.filter((item) => Number(item.confidence || 0) < 0.6).length;
  if (lowConfidence) {
    warnings.push(`${lowConfidence} item(ns) tiveram leitura com baixa confiança. Confira nome e preço com atenção.`);
  }

  return {
    items: deduped,
    warnings: Array.from(new Set(warnings)).slice(0, 20),
    raw_text: rawSections.join("\n\n"),
  };
}
