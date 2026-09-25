import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Col, Form, Row, Spinner } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";
import {
  brazilianCepDigits,
  formatBrazilianCep,
  isBrazilianCep,
  sanitizePostalCodeInput,
} from "../../utils/postalCode";

const cityId = (city) => city?.ibge_code ?? city?.city_id ?? city?.id ?? city?.code ?? "";
const cityName = (city) => city?.name ?? city?.city ?? city?.nome ?? "";
const cityUf = (city) => city?.uf ?? city?.state_code ?? city?.state?.uf ?? "";

export default function LocationFields({ value, onChange, required = false, showPublicToggle = false }) {
  const [cities, setCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [notice, setNotice] = useState("");
  const timer = useRef(null);
  const set = (field, next) => onChange({ ...value, [field]: next });

  useEffect(() => () => clearTimeout(timer.current), []);

  const searchCity = (text) => {
    onChange({ ...value, city: text, city_id: "" });
    setCities([]);
    clearTimeout(timer.current);
    setNotice("");
    if (text.trim().length < 2) return;

    timer.current = setTimeout(async () => {
      setLoadingCities(true);
      try {
        const result = await cutinappService.locationCities("", text.trim());
        setCities((Array.isArray(result) ? result : []).filter((city) => cityId(city) && cityName(city)));
      } catch {
        setNotice("Não foi possível consultar sugestões de cidades do Brasil agora. Você pode continuar preenchendo a localização manualmente.");
      } finally {
        setLoadingCities(false);
      }
    }, 300);
  };

  const chooseCity = (city) => {
    onChange({
      ...value,
      city: cityName(city),
      city_id: String(cityId(city)),
      uf: cityUf(city),
    });
    setCities([]);
    setNotice("");
  };

  const lookupBrazilianCep = async () => {
    if (!isBrazilianCep(value.cep)) return;
    const cep = brazilianCepDigits(value.cep);
    setLoadingCep(true);
    setNotice("");
    try {
      const found = await cutinappService.lookupCep(cep);
      const resolvedCityId = found?.city_id ?? found?.ibge_code ?? found?.ibge ?? value.city_id;
      onChange({
        ...value,
        cep: formatBrazilianCep(cep),
        address: found?.street || value.address,
        neighborhood: found?.neighborhood || value.neighborhood,
        address_complement: value.address_complement || found?.complement || "",
        uf: found?.uf || value.uf,
        city: found?.city || found?.name || value.city,
        city_id: resolvedCityId ? String(resolvedCityId) : value.city_id,
      });
    } catch {
      setNotice("Não conseguimos consultar este CEP brasileiro. Você pode continuar preenchendo o endereço manualmente.");
    } finally {
      setLoadingCep(false);
    }
  };

  return <div className="cut-location-fields" data-pt-location-native="true">
    {notice && <Alert variant="warning" className="py-2">{notice}</Alert>}
    <Row className="g-3">
      <Col md={3}>
        <Form.Group>
          <Form.Label>Código postal</Form.Label>
          <div className="position-relative">
            <Form.Control
              value={value.cep || ""}
              onChange={(e) => set("cep", sanitizePostalCodeInput(e.target.value))}
              inputMode="text"
              autoComplete="postal-code"
              maxLength={20}
              placeholder="Código postal"
            />
            {loadingCep && <Spinner size="sm" className="cut-location-spinner" />}
          </div>
          <Form.Text>Formatos internacionais são aceitos.</Form.Text>
          {isBrazilianCep(value.cep) && <div className="mt-1">
            <Button type="button" variant="link" size="sm" className="p-0" disabled={loadingCep} onClick={lookupBrazilianCep}>
              Preencher endereço por CEP brasileiro
            </Button>
          </div>}
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group className="cut-autocomplete">
          <Form.Label>Cidade {required && "*"}</Form.Label>
          <div className="position-relative">
            <Form.Control
              value={value.city || ""}
              onChange={(e) => searchCity(e.target.value)}
              autoComplete="address-level2"
              role="combobox"
              aria-expanded={cities.length > 0}
              placeholder="Cidade"
              required={required}
            />
            {loadingCities && <Spinner size="sm" className="cut-location-spinner" />}
            {cities.length > 0 && <div className="cut-autocomplete-menu" role="listbox">
              {cities.map((city) => <button type="button" role="option" key={String(cityId(city))} onClick={() => chooseCity(city)}>
                <span>{cityName(city)}{cityUf(city) ? ` - ${cityUf(city)}` : ""}</span>
                <small>Brasil · IBGE {cityId(city)}</small>
              </button>)}
            </div>}
          </div>
          {value.city && !value.city_id && <Form.Text>Cidade informada manualmente. Sugestões oficiais acima são opcionais e atualmente cobrem cidades brasileiras.</Form.Text>}
        </Form.Group>
      </Col>
      <Col md={3}>
        <Form.Group>
          <Form.Label>Estado / região</Form.Label>
          <Form.Control
            value={value.uf || ""}
            onChange={(e) => set("uf", e.target.value)}
            placeholder="Estado, província ou região"
            aria-label="Estado, província ou região"
            autoComplete="address-level1"
            maxLength={100}
          />
          <Form.Text>Use a subdivisão local aplicável ao endereço.</Form.Text>
        </Form.Group>
      </Col>
      <Col md={8}><Form.Group><Form.Label>Endereço</Form.Label><Form.Control value={value.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="Rua, avenida, via..." autoComplete="address-line1" /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Número / unidade</Form.Label><Form.Control value={value.address_number || ""} onChange={(e) => set("address_number", e.target.value)} autoComplete="address-line2" /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Bairro / distrito</Form.Label><Form.Control value={value.neighborhood || ""} onChange={(e) => set("neighborhood", e.target.value)} /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Complemento</Form.Label><Form.Control value={value.address_complement || ""} onChange={(e) => set("address_complement", e.target.value)} /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Referência</Form.Label><Form.Control value={value.address_reference || ""} onChange={(e) => set("address_reference", e.target.value)} /></Form.Group></Col>
      {showPublicToggle && <Col xs={12}><Form.Check type="switch" checked={Boolean(value.location_public)} onChange={(e) => set("location_public", e.target.checked ? 1 : 0)} label="Exibir localização comercial na página pública" /></Col>}
    </Row>
  </div>;
}

LocationFields.propTypes = {
  value: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  required: PropTypes.bool,
  showPublicToggle: PropTypes.bool,
};
