import React, { useEffect, useId, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Form, Spinner } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";

const cityId = (city) => city?.ibge_code ?? city?.city_id ?? city?.id ?? city?.code ?? "";
const cityName = (city) => city?.name ?? city?.city ?? city?.nome ?? "";
const cityUf = (city) => String(city?.uf ?? city?.state_code ?? city?.state?.uf ?? "").toUpperCase().slice(0, 2);

export default function CityAutocompleteControl({
  value,
  onChange,
  isInvalid = false,
  placeholder = "Digite a cidade",
  required = false,
}) {
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const requestRef = useRef(0);
  const listId = useId();

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    requestRef.current += 1;
  }, []);

  const search = (text) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    onChange({ city: text, uf: "", selected: false });
    setCities([]);
    window.clearTimeout(timerRef.current);

    const query = text.trim();
    if (query.length < 2) {
      setLoading(false);
      return;
    }

    timerRef.current = window.setTimeout(async () => {
      setLoading(true);

      try {
        const result = await cutinappService.locationCities("", query);
        if (requestRef.current !== requestId) return;

        const normalized = (Array.isArray(result) ? result : [])
          .filter((city) => cityId(city) && cityName(city))
          .slice(0, 12);

        setCities(normalized);
      } catch {
        if (requestRef.current === requestId) setCities([]);
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 250);
  };

  const choose = (city) => {
    onChange({
      city: cityName(city),
      uf: cityUf(city),
      selected: true,
    });
    setCities([]);
  };

  return (
    <div className="position-relative">
      <Form.Control
        name="event-city-lookup"
        value={value || ""}
        onChange={(event) => search(event.target.value)}
        onBlur={() => window.setTimeout(() => setCities([]), 120)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={cities.length > 0}
        aria-controls={listId}
        placeholder={placeholder}
        isInvalid={isInvalid}
        required={required}
      />
      {loading && <Spinner size="sm" className="cut-location-spinner" aria-label="Buscando cidades" />}
      {cities.length > 0 && (
        <div id={listId} className="cut-autocomplete-menu" role="listbox">
          {cities.map((city) => (
            <button
              type="button"
              role="option"
              key={String(cityId(city))}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(city)}
            >
              <span>{cityName(city)}{cityUf(city) ? ` - ${cityUf(city)}` : ""}</span>
              <small>IBGE {cityId(city)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

CityAutocompleteControl.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  isInvalid: PropTypes.bool,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
};
