import { safeGetLocalJson, safeSetLocalJson } from "./safeStorage";

export const PERIOD_OPTIONS = [
  ["today", "Hoje"],
  ["tomorrow", "Amanhã"],
  ["weekend", "Fim de semana"],
  ["friday", "Sexta-feira"],
  ["saturday", "Sábado"],
  ["sunday", "Domingo"],
  ["next7", "Próximos 7 dias"],
  ["next30", "Próximos 30 dias"],
  ["month", "Este mês"],
];

export const periodLabel = (value) => PERIOD_OPTIONS.find(([key]) => key === value)?.[1] || "";

export const readDiscoveryPreference = () => safeGetLocalJson("cutinapp.discovery", {});

const cityKey = (value) => `${String(value?.city || "").trim().toLocaleLowerCase("pt-BR")}|${String(value?.uf || "").trim().toLocaleUpperCase("pt-BR")}`;

export const saveDiscoveryPreference = (value) => {
  safeSetLocalJson("cutinapp.discovery", value);
  const storedRecent = safeGetLocalJson("cutinapp.recentCities", []);
  const recent = Array.isArray(storedRecent) ? storedRecent : [];
  if (value?.city) {
    const selected = { city: String(value.city).trim(), uf: String(value.uf || "").trim().toLocaleUpperCase("pt-BR") };
    const selectedKey = cityKey(selected);
    const next = [selected, ...recent.filter((item) => cityKey(item) !== selectedKey)].slice(0, 5);
    safeSetLocalJson("cutinapp.recentCities", next);
  }
};

export const readRecentCities = () => safeGetLocalJson("cutinapp.recentCities", []);

export const paramsFromSearch = (searchParams) => {
  const keys = [
    "q", "type", "city", "uf", "category", "genre", "format", "period", "date", "from", "to",
    "sort", "artist_id", "production_id", "free", "available", "max_price", "lat", "lng", "radius_km", "page",
  ];
  const result = {};
  keys.forEach((key) => {
    const value = searchParams.get(key);
    if (value !== null && value !== "") result[key] = value;
  });
  return result;
};
