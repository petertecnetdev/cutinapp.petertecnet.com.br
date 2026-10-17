import React, { useEffect, useId, useState } from "react";
import PropTypes from "prop-types";
import { useLocation, useNavigate } from "react-router-dom";
import cutinappService from "../../services/CutinappService";
import useDiscoveryCity from "../../hooks/useDiscoveryCity";
import { availableEventCities, cityIdentity } from "../../utils/discoveryCities";
import { saveDiscoveryPreference } from "../../utils/discoveryFilters";
import { clearHomeLocation, saveHomeLocation } from "../../utils/homeLocationStorage";
import "./CityNavSelect.css";

// Compartilhado entre seletor mobile e desktop para evitar requisições duplicadas.
let citiesPromise;
let cachedAt = 0;
const loadCities = () => {
  if (!citiesPromise || Date.now() - cachedAt > 5 * 60 * 1000) {
    cachedAt = Date.now();
    citiesPromise = cutinappService.availableCities("events").then((data) => availableEventCities(data?.cities))
      .catch((error) => { citiesPromise = null; throw error; });
  }
  return citiesPromise;
};

const isListing = (pathname) => ["/event", "/productions", "/artists", "/search"].includes(pathname);

export default function CityNavSelect({ variant = "desktop" }) {
  const id = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const selected = useDiscoveryCity();
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    loadCities().then((list) => { if (active) setCities(list); })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selectionKey = selected.city ? cityIdentity(selected.city, selected.uf) : "";
  const found = cities.some((city) => cityIdentity(city.city, city.uf) === selectionKey);
  const changeCity = (event) => {
    const nextCity = cities.find((city) => cityIdentity(city.city, city.uf) === event.target.value);
    if (!nextCity && event.target.value !== "") return;
    const next = nextCity
      ? { city: nextCity.city, uf: nextCity.uf, city_id: nextCity.city_id }
      : { city: "", uf: "", mode: "all" };
    if (nextCity) saveHomeLocation(next);
    else clearHomeLocation();
    saveDiscoveryPreference(next);

    if (isListing(location.pathname)) {
      const params = new URLSearchParams(location.search);
      ["city", "uf", "city_id", "lat", "lng", "radius_km", "page"].forEach((key) => params.delete(key));
      if (nextCity) {
        params.set("city", nextCity.city);
        if (nextCity.uf) params.set("uf", nextCity.uf);
      }
      navigate({ pathname: location.pathname, search: params.toString() ? `?${params}` : "" }, { replace: true });
    }
  };

  return (
    <div className={`cut-city-nav cut-city-nav--${variant}`}>
      <label htmlFor={id}><i className="fa-solid fa-location-dot" aria-hidden="true" /> <span>Cidade</span></label>
      <select id={id} aria-label="Cidade para descobrir eventos, produções e artistas"
        value={found ? selectionKey : (selected.city && !loading && !error ? "__old__" : "")}
        onChange={changeCity} disabled={loading || error}
        title={error ? "Não foi possível carregar as cidades disponíveis" : "Escolher cidade"}>
        <option value="">{loading ? "Carregando..." : error ? "Cidades indisponíveis" : "Todas as cidades"}</option>
        {!loading && !error && selected.city && !found && <option value="__old__" disabled>{selected.city}{selected.uf ? ` - ${selected.uf}` : ""} (indisponível)</option>}
        {cities.map((city) => <option key={cityIdentity(city.city, city.uf)} value={cityIdentity(city.city, city.uf)}>
          {city.city}{city.uf ? ` - ${city.uf}` : ""}
        </option>)}
      </select>
    </div>
  );
}
CityNavSelect.propTypes = { variant: PropTypes.oneOf(["desktop", "mobile"]) };
