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

export const saveDiscoveryPreference = (value) => {
  safeSetLocalJson("cutinapp.discovery", value);
  const storedRecent = safeGetLocalJson("cutinapp.recentCities", []);
  const recent = Array.isArray(storedRecent) ? storedRecent : [];
  if (value?.city) {
    const next = [{ city: value.city, uf: value.uf || "" }, ...recent.filter((item) => item?.city !== value.city)].slice(0, 5);
    safeSetLocalJson("cutinapp.recentCities", next);
  }
};

export const readRecentCities = () => safeGetLocalJson("cutinapp.recentCities", []);

export const paramsFromSearch = (searchParams) => {
  const keys = ["q", "city", "uf", "category", "period", "date", "from", "to", "sort", "artist_id", "production_id", "free", "available", "lat", "lng", "radius_km", "page"];
  const result = {};
  keys.forEach((key) => {
    const value = searchParams.get(key);
    if (value !== null && value !== "") result[key] = value;
  });
  return result;
};
