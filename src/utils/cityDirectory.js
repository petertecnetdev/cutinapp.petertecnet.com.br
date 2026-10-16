import { cityIdentity } from "./discoveryCities";

// Diretório público de cidades: somente localidades com eventos descobríveis.
// Os slugs e os totais vêm do serviço geográfico central da API.
export const normalizeSearchText = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR")
  .trim();

const safeSlug = (city, uf, candidate) => {
  const slug = String(candidate || "").toLowerCase();
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return slug;
  return (normalizeSearchText(city + "-" + uf).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
};

export const normalizeAvailableEventCities = (response) => {
  const rows = Array.isArray(response?.cities) ? response.cities : [];
  const unique = new Map();
  rows.forEach((item) => {
    const city = String(item?.city || item?.name || "").trim();
    const uf = String(item?.uf || "").trim().toUpperCase();
    const total = Number(item?.total ?? item?.count);
    if (!city || !/^[A-Z]{2}$/.test(uf) || !Number.isFinite(total) || total <= 0) return;
    const slug = safeSlug(city, uf, item?.slug);
    if (!slug) return;
    const key = cityIdentity(city, uf);
    const previous = unique.get(key);
    // A API já agrupa registros legados e canônicos; evitar duplicar links no cliente.
    if (!previous || total > previous.total) unique.set(key, { city, uf, slug, total, city_id: item?.city_id || null });
  });
  return Array.from(unique.values()).sort((a, b) => b.total - a.total || a.city.localeCompare(b.city, "pt-BR"));
};

export const filterAvailableEventCities = (cities, search = "") => {
  const query = normalizeSearchText(search);
  return query ? cities.filter(({ city, uf }) => normalizeSearchText(city + " " + uf).includes(query)) : cities;
};

export const groupCitiesByState = (cities) => {
  const groups = new Map();
  cities.forEach((city) => {
    if (!groups.has(city.uf)) groups.set(city.uf, []);
    groups.get(city.uf).push(city);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"))
    .map(([uf, entries]) => ({ uf, cities: [...entries].sort((a, b) => a.city.localeCompare(b.city, "pt-BR")) }));
};
