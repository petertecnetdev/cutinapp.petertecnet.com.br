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

export const readDiscoveryPreference = () => {
  try {
    return JSON.parse(window.localStorage.getItem("cutinapp.discovery") || "{}");
  } catch (_) {
    return {};
  }
};

export const saveDiscoveryPreference = (value) => {
  try {
    window.localStorage.setItem("cutinapp.discovery", JSON.stringify(value));
    const recent = JSON.parse(window.localStorage.getItem("cutinapp.recentCities") || "[]");
    if (value?.city) {
      const next = [{ city: value.city, uf: value.uf || "" }, ...recent.filter((item) => item.city !== value.city)].slice(0, 5);
      window.localStorage.setItem("cutinapp.recentCities", JSON.stringify(next));
    }
  } catch (_) {
    // Persistência local é apenas uma conveniência; a busca continua funcionando sem ela.
  }
};

export const readRecentCities = () => {
  try {
    return JSON.parse(window.localStorage.getItem("cutinapp.recentCities") || "[]");
  } catch (_) {
    return [];
  }
};

export const paramsFromSearch = (searchParams) => {
  const keys = ["q", "city", "uf", "category", "period", "date", "from", "to", "sort", "artist_id", "production_id", "free", "available", "lat", "lng", "radius_km", "page"];
  const result = {};
  keys.forEach((key) => {
    const value = searchParams.get(key);
    if (value !== null && value !== "") result[key] = value;
  });
  return result;
};
