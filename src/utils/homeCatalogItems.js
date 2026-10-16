// Itens públicos de estabelecimentos e itens vendidos em eventos usam domínios
// distintos. Não converter um Item genérico em EventItem ou usar rotas de checkout.
export const selectHomeCatalogItems = (items, establishments, limit = 12) => {
  const companyById = new Map((Array.isArray(establishments) ? establishments : [])
    .filter((company) => company?.id)
    .map((company) => [String(company.id), company]));
  const groups = new Map();
  const seen = new Set();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = Number(item?.id);
    const companyId = String(item?.entity_id || "");
    if (!Number.isSafeInteger(id) || id <= 0 || !companyId || seen.has(id)
      || !item?.name || item?.entity_name !== "establishment"
      || item?.status === false || item?.status === 0 || item?.archived_at) return;
    seen.add(id);
    const group = groups.get(companyId) || [];
    group.push({ ...item, __kind: "catalog", __production: companyById.get(companyId) || null });
    groups.set(companyId, group);
  });

  // Distribuição por produção: não deixar dezenas de itens recentes da mesma
  // empresa monopolizarem a faixa da home.
  const chosen = [];
  while (chosen.length < limit && [...groups.values()].some((group) => group.length > 0)) {
    for (const group of groups.values()) {
      if (chosen.length >= limit) break;
      if (group.length) chosen.push(group.shift());
    }
  }
  return chosen;
};

export const homeCatalogItemRoute = (itemId) => `/catalogo/item/${encodeURIComponent(String(itemId))}`;
