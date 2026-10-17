// Uma cidade deve existir no catálogo de eventos para aparecer na navegação.
export const cityIdentity = (city, uf) =>
  `${String(city || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")}|${String(uf || "").trim().toUpperCase()}`;

export const availableEventCities = (rows = []) => {
  const unique = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row?.city || !Number.isFinite(Number(row?.total)) || Number(row.total) <= 0) return;
    const city = String(row.city).trim();
    const uf = String(row.uf || "").trim().toUpperCase();
    if (!city) return;
    const key = cityIdentity(city, uf);
    if (!unique.has(key)) unique.set(key, { city, uf, city_id: row.city_id || null, total: Number(row.total) });
  });
  return [...unique.values()].sort((a, b) => a.city.localeCompare(b.city, "pt-BR") || a.uf.localeCompare(b.uf));
};

export const matchesSelectedCity = (entity, selection) => {
  if (!selection?.city) return true;
  if (!entity?.city) return false;
  const entityUf = entity.uf || entity.state_code || entity.state?.uf || "";
  if (selection.uf && String(entityUf).toUpperCase() !== String(selection.uf).toUpperCase()) return false;
  return cityIdentity(entity.city, selection.uf ? entityUf : "") === cityIdentity(selection.city, selection.uf || "");
};

export const withSelectedCity = (params = {}, selection = {}) => ({
  ...params,
  ...(selection.city ? { city: selection.city, ...(selection.uf ? { uf: selection.uf } : {}) } : {}),
});
