import React, { useEffect, useMemo, useState } from "react";
import cutinappService from "../../services/CutinappService";
import { readRecentCities } from "../../utils/discoveryFilters";

const key = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function CityPicker({ selectedCity, selectedUf, onSelect }) {
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    cutinappService.discoveryFacets().then((data) => {
      if (active) setCities(Array.isArray(data?.cities) ? data.cities : []);
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const options = useMemo(() => {
    const all = [...readRecentCities(), ...cities];
    const unique = new Map();
    all.forEach((item) => {
      if (!item?.city) return;
      const id = `${key(item.city)}|${key(item.uf)}`;
      if (!unique.has(id)) unique.set(id, item);
    });
    return [...unique.values()].filter((item) => key(`${item.city} ${item.uf || ""}`).includes(key(query.trim()))).slice(0, 40);
  }, [cities, query]);
  return <div className="cut-city-picker">
    <label htmlFor="cut-city-query">Buscar cidade</label>
    <input id="cut-city-query" type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite a cidade ou UF" />
    <div className="cut-city-picker__list" role="group" aria-label="Cidades disponíveis">
      <button type="button" onClick={() => onSelect(null)}>Todas as cidades</button>
      {options.map((item) => <button type="button" key={`${item.city}-${item.uf}`} aria-pressed={key(item.city) === key(selectedCity) && key(item.uf) === key(selectedUf)} onClick={() => onSelect(item)}>
        <span>{item.city}{item.uf ? ` - ${item.uf}` : ""}</span>{Number.isFinite(Number(item.total)) && <small>{item.total} eventos</small>}
      </button>)}
    </div>
    {loading && <p>Carregando cidades...</p>}
    {error && <p>Não foi possível carregar a lista. Tente novamente.</p>}
    {!loading && !error && options.length === 0 && <p>Nenhuma cidade encontrada.</p>}
  </div>;
}
