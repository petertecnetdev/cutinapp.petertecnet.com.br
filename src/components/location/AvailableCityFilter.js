import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Form } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";
import "./AvailableCityFilter.css";

const key = (city, uf) => JSON.stringify([String(city || ""), String(uf || "").toUpperCase()]);

/** Only offers cities backed by public records for the current application and entity type. */
export default function AvailableCityFilter({ type, city = "", uf = "", onSelect, ariaLabel = "Filtrar por cidade" }) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    cutinappService.availableCities(type)
      .then((list) => {
        if (active) setCities(Array.isArray(list) ? list.filter((entry) => entry?.city && Number(entry?.total) > 0) : []);
      })
      .catch(() => {
        if (active) {
          setCities([]);
          setError(true);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type]);

  const currentKey = city ? key(city, uf) : "";
  const foundCurrent = useMemo(
    () => cities.some((entry) => key(entry.city, entry.uf) === currentKey),
    [cities, currentKey]
  );

  const handleChange = (event) => {
    const option = cities.find((item) => key(item.city, item.uf) === event.target.value);
    onSelect(option ? { city: option.city, uf: option.uf || "" } : { city: "", uf: "" });
  };

  return (
    <Form.Select
      className="cut-available-city-filter"
      value={currentKey}
      onChange={handleChange}
      aria-label={ariaLabel}
      disabled={loading || error}
    >
      <option value="">{loading ? "Carregando cidades..." : error ? "Cidades indisponíveis" : "Todas as cidades"}</option>
      {!loading && !error && city && !foundCurrent && (
        <option value={currentKey}>{city}{uf ? " - " + uf : ""} (sem registros disponíveis)</option>
      )}
      {!loading && !error && cities.map((entry) => (
        <option key={key(entry.city, entry.uf)} value={key(entry.city, entry.uf)}>
          {entry.city}{entry.uf ? " - " + entry.uf : ""} ({entry.total})
        </option>
      ))}
    </Form.Select>
  );
}

AvailableCityFilter.propTypes = {
  type: PropTypes.oneOf(["productions", "events", "artists", "products"]).isRequired,
  city: PropTypes.string,
  uf: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  ariaLabel: PropTypes.string,
};
