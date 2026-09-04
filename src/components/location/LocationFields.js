import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Col, Form, Row, Spinner } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 8);
const cepMask = (value) => { const d = digits(value); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
const sessionToken = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const clearGoogleSelection = (value) => ({
  ...value,
  place_id: "",
  google_maps_url: "",
  latitude: "",
  longitude: "",
  formatted_address: "",
});

export default function LocationFields({ value, onChange, required = false, showPublicToggle = false, showPlaceSearch = true }) {
  const [cities, setCities] = useState([]);
  const [places, setPlaces] = useState([]);
  const [placeQuery, setPlaceQuery] = useState(value.venue || value.formatted_address || "");
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [selectingPlace, setSelectingPlace] = useState(false);
  const [notice, setNotice] = useState("");
  const cityTimer = useRef(null);
  const placeTimer = useRef(null);
  const placeSession = useRef(sessionToken());

  const set = (field, next) => onChange({ ...value, [field]: next });
  const setPhysicalField = (field, next) => onChange({ ...clearGoogleSelection(value), [field]: next });
  const mapQuery = useMemo(() => {
    if (value.latitude && value.longitude) return `${value.latitude},${value.longitude}`;
    return value.formatted_address || [value.address, value.address_number, value.neighborhood, value.city, value.uf].filter(Boolean).join(", ");
  }, [value.latitude, value.longitude, value.formatted_address, value.address, value.address_number, value.neighborhood, value.city, value.uf]);
  const mapEmbedUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&output=embed` : "";
  const openMapsUrl = value.google_maps_url || (mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : "");

  useEffect(() => () => {
    clearTimeout(cityTimer.current);
    clearTimeout(placeTimer.current);
  }, []);

  useEffect(() => {
    if (value.place_id && (value.venue || value.formatted_address)) {
      setPlaceQuery(value.venue || value.formatted_address);
    }
  }, [value.place_id, value.venue, value.formatted_address]);

  const searchCity = (text) => {
    onChange({ ...clearGoogleSelection(value), city: text, city_id: "", uf: "" });
    setCities([]);
    clearTimeout(cityTimer.current);
    setNotice("");
    if (text.trim().length < 2) return;
    cityTimer.current = setTimeout(async () => {
      setLoadingCities(true);
      try {
        setCities(await cutinappService.locationCities("", text.trim()));
      } catch {
        setNotice("Não foi possível consultar as cidades brasileiras agora.");
      } finally {
        setLoadingCities(false);
      }
    }, 300);
  };

  const chooseCity = (city) => {
    onChange({ ...value, city: city.name, city_id: String(city.ibge_code), uf: city.uf });
    setCities([]);
    setNotice("");
  };

  const searchPlace = (text) => {
    setPlaceQuery(text);
    setPlaces([]);
    setNotice("");
    clearTimeout(placeTimer.current);
    if (value.place_id) onChange(clearGoogleSelection(value));
    if (text.trim().length < 2) return;

    placeTimer.current = setTimeout(async () => {
      setLoadingPlaces(true);
      try {
        setPlaces(await cutinappService.locationPlaces(text.trim(), placeSession.current));
      } catch (error) {
        setNotice(error?.message || "Não foi possível buscar locais no Google Maps agora. Use o CEP ou preencha manualmente.");
      } finally {
        setLoadingPlaces(false);
      }
    }, 350);
  };

  const choosePlace = async (suggestion) => {
    setSelectingPlace(true);
    setPlaces([]);
    setNotice("");
    try {
      const found = await cutinappService.locationPlace(suggestion.place_id, placeSession.current);
      const next = {
        ...value,
        place_id: found.place_id || suggestion.place_id,
        formatted_address: found.formatted_address || suggestion.label || "",
        google_maps_url: found.google_maps_url || "",
        latitude: found.latitude ?? "",
        longitude: found.longitude ?? "",
        cep: found.cep ? cepMask(found.cep) : (value.cep || ""),
        address: found.address || value.address || "",
        address_number: found.address_number || value.address_number || "",
        neighborhood: found.neighborhood || value.neighborhood || "",
        city: found.city || value.city || "",
        city_id: found.city_id ? String(found.city_id) : (value.city_id || ""),
        uf: found.uf || value.uf || "",
      };
      if (hasOwn(value, "venue")) next.venue = suggestion.name || value.venue || "";
      onChange(next);
      setPlaceQuery(suggestion.label || suggestion.name || found.formatted_address || "");
      placeSession.current = sessionToken();
      if (!next.city_id && next.city) {
        setNotice("Local encontrado. Confirme a cidade na lista oficial antes de salvar.");
      }
    } catch (error) {
      setNotice(error?.message || "Não foi possível carregar os detalhes deste local. Tente outra opção ou use o CEP.");
    } finally {
      setSelectingPlace(false);
    }
  };

  const lookupCep = async () => {
    const cep = digits(value.cep);
    if (cep.length !== 8) return;
    setLoadingCep(true);
    setNotice("");
    try {
      const found = await cutinappService.lookupCep(cep);
      onChange({
        ...clearGoogleSelection(value),
        cep: cepMask(cep),
        address: found.street || value.address,
        neighborhood: found.neighborhood || value.neighborhood,
        address_complement: value.address_complement || found.complement || "",
        uf: found.uf || value.uf,
        city: found.city || value.city,
        city_id: found.city_id ? String(found.city_id) : value.city_id,
      });
      if (hasOwn(value, "venue")) setPlaceQuery(value.venue || "");
    } catch {
      setNotice("Não conseguimos consultar o CEP. Confira o número ou preencha o endereço e selecione a cidade pela lista oficial.");
    } finally {
      setLoadingCep(false);
    }
  };

  return <div className="cut-location-fields" data-pt-location-native="true">
    {notice && <Alert variant="warning" className="py-2">{notice}</Alert>}
    <Row className="g-3">
      {showPlaceSearch && <Col xs={12}><Form.Group className="cut-autocomplete"><Form.Label>Buscar local no Google Maps</Form.Label><div className="position-relative"><Form.Control value={placeQuery} onChange={(e) => searchPlace(e.target.value)} autoComplete="off" role="combobox" aria-expanded={places.length > 0} placeholder="Digite o nome do local, casa de eventos, bar, endereço..." />{(loadingPlaces || selectingPlace) && <Spinner size="sm" className="cut-location-spinner" />}{places.length > 0 && <div className="cut-autocomplete-menu" role="listbox">{places.map((place) => <button type="button" role="option" key={place.place_id} onClick={() => choosePlace(place)}><strong>{place.name || place.label}</strong>{place.secondary_text && <small>{place.secondary_text}</small>}</button>)}<div className="px-3 py-2 text-end text-secondary small" aria-label="Resultados fornecidos pelo Google Maps">Google Maps</div></div>}</div><Form.Text>Selecione uma sugestão para preencher endereço, cidade, CEP e coordenadas automaticamente.</Form.Text></Form.Group></Col>}
      {hasOwn(value, "venue") && <Col xs={12}><Form.Group><Form.Label>Nome do local</Form.Label><Form.Control value={value.venue || ""} onChange={(e) => set("venue", e.target.value)} placeholder="Ex.: La Fyesta Pub" /></Form.Group></Col>}
      <Col md={3}><Form.Group><Form.Label>CEP</Form.Label><div className="position-relative"><Form.Control value={value.cep || ""} onChange={(e) => setPhysicalField("cep", cepMask(e.target.value))} onBlur={lookupCep} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" />{loadingCep && <Spinner size="sm" className="cut-location-spinner" />}</div><Form.Text>Digite o CEP para preencher o endereço automaticamente.</Form.Text></Form.Group></Col>
      <Col md={6}><Form.Group className="cut-autocomplete"><Form.Label>Cidade {required && "*"}</Form.Label><div className="position-relative"><Form.Control value={value.city || ""} onChange={(e) => searchCity(e.target.value)} autoComplete="off" role="combobox" aria-expanded={cities.length > 0} placeholder="Digite a cidade e selecione Cidade - UF" required={required} />{loadingCities && <Spinner size="sm" className="cut-location-spinner" />}{cities.length > 0 && <div className="cut-autocomplete-menu" role="listbox">{cities.map((city) => <button type="button" role="option" key={city.ibge_code} onClick={() => chooseCity(city)}><span>{city.name} - {city.uf}</span><small>IBGE {city.ibge_code}</small></button>)}</div>}</div>{value.city && !value.city_id && <Form.Text className="text-warning">Selecione uma opção da lista oficial. Texto livre não será aceito.</Form.Text>}</Form.Group></Col>
      <Col md={3}><Form.Group><Form.Label>UF {required && "*"}</Form.Label><Form.Control value={value.uf || ""} readOnly placeholder="UF" aria-label="UF definida pela cidade" required={required} /><Form.Text>Preenchida pela cidade, CEP ou Google Maps.</Form.Text></Form.Group></Col>
      <Col md={8}><Form.Group><Form.Label>Logradouro {required && "*"}</Form.Label><Form.Control value={value.address || ""} onChange={(e) => setPhysicalField("address", e.target.value)} placeholder="Rua, avenida..." autoComplete="address-line1" required={required} /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Número</Form.Label><Form.Control value={value.address_number || ""} onChange={(e) => setPhysicalField("address_number", e.target.value)} autoComplete="address-line2" /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Bairro</Form.Label><Form.Control value={value.neighborhood || ""} onChange={(e) => setPhysicalField("neighborhood", e.target.value)} /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Complemento</Form.Label><Form.Control value={value.address_complement || ""} onChange={(e) => set("address_complement", e.target.value)} /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Referência</Form.Label><Form.Control value={value.address_reference || ""} onChange={(e) => set("address_reference", e.target.value)} /></Form.Group></Col>
      {showPublicToggle && <Col xs={12}><Form.Check type="switch" checked={Boolean(value.location_public)} onChange={(e) => set("location_public", e.target.checked ? 1 : 0)} label="Exibir localização comercial na página pública" /></Col>}
      {mapEmbedUrl && <Col xs={12}><div className="cut-location-map-preview overflow-hidden rounded"><iframe title="Prévia do local selecionado" src={mapEmbedUrl} width="100%" height="300" style={{ border: 0, display: "block" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></div><div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2"><small className="text-secondary">{value.formatted_address || mapQuery}</small>{openMapsUrl && <Button as="a" href={openMapsUrl} target="_blank" rel="noreferrer" size="sm" variant="outline-light"><i className="fa-solid fa-location-arrow me-2" />Abrir no Google Maps</Button>}</div></Col>}
    </Row>
  </div>;
}

LocationFields.propTypes = {
  value: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  required: PropTypes.bool,
  showPublicToggle: PropTypes.bool,
  showPlaceSearch: PropTypes.bool,
};
