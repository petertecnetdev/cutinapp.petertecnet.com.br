import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Col, Form, Row, Spinner } from "react-bootstrap";
import cutinappService from "../../services/CutinappService";

const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 8);
const cepMask = (value) => { const d = digits(value); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d; };
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
    onChange({ ...value, city: text, city_id: "", uf: "" });
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
        setNotice("Não foi possível consultar as cidades brasileiras agora.");
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

  const lookupCep = async () => {
    const cep = digits(value.cep);
    if (cep.length !== 8) return;
    setLoadingCep(true);
    setNotice("");
    try {
      const found = await cutinappService.lookupCep(cep);
      const resolvedCityId = found?.city_id ?? found?.ibge_code ?? found?.ibge ?? value.city_id;
      onChange({
        ...value,
        cep: cepMask(cep),
        address: found?.street || value.address,
        neighborhood: found?.neighborhood || value.neighborhood,
        address_complement: value.address_complement || found?.complement || "",
        uf: found?.uf || value.uf,
        city: found?.city || found?.name || value.city,
        city_id: resolvedCityId ? String(resolvedCityId) : value.city_id,
      });
    } catch {
      setNotice("Não conseguimos consultar o CEP. Confira o número ou preencha o endereço e selecione a cidade pela lista oficial.");
    } finally {
      setLoadingCep(false);
    }
  };

  return <div className="cut-location-fields" data-pt-location-native="true">
    {notice && <Alert variant="warning" className="py-2">{notice}</Alert>}
    <Row className="g-3">
      <Col md={3}>
        <Form.Group>
          <Form.Label>CEP</Form.Label>
          <div className="position-relative">
            <Form.Control value={value.cep || ""} onChange={(e) => set("cep", cepMask(e.target.value))} onBlur={lookupCep} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" />
            {loadingCep && <Spinner size="sm" className="cut-location-spinner" />}
          </div>
          <Form.Text>Digite o CEP para preencher o endereço automaticamente.</Form.Text>
        </Form.Group>
      </Col>
      <Col md={6}>
        <Form.Group className="cut-autocomplete">
          <Form.Label>Cidade {required && "*"}</Form.Label>
          <div className="position-relative">
            <Form.Control value={value.city || ""} onChange={(e) => searchCity(e.target.value)} autoComplete="off" role="combobox" aria-expanded={cities.length > 0} placeholder="Digite a cidade e selecione Cidade - UF" required={required} />
            {loadingCities && <Spinner size="sm" className="cut-location-spinner" />}
            {cities.length > 0 && <div className="cut-autocomplete-menu" role="listbox">
              {cities.map((city) => <button type="button" role="option" key={String(cityId(city))} onClick={() => chooseCity(city)}>
                <span>{cityName(city)}{cityUf(city) ? ` - ${cityUf(city)}` : ""}</span>
                <small>IBGE {cityId(city)}</small>
              </button>)}
            </div>}
          </div>
          {value.city && !value.city_id && <Form.Text className="text-warning">Selecione uma opção da lista oficial. Se houver uma correspondência exata, a Cutinapp também tentará confirmá-la automaticamente ao salvar.</Form.Text>}
        </Form.Group>
      </Col>
      <Col md={3}>
        <Form.Group>
          <Form.Label>UF {required && "*"}</Form.Label>
          <Form.Control value={value.uf || ""} readOnly placeholder="UF" aria-label="UF definida pela cidade" required={required} />
          <Form.Text>Preenchida pela cidade ou pelo CEP.</Form.Text>
        </Form.Group>
      </Col>
      <Col md={8}><Form.Group><Form.Label>Logradouro</Form.Label><Form.Control value={value.address || ""} onChange={(e) => set("address", e.target.value)} placeholder="Rua, avenida..." autoComplete="address-line1" /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Número</Form.Label><Form.Control value={value.address_number || ""} onChange={(e) => set("address_number", e.target.value)} autoComplete="address-line2" /></Form.Group></Col>
      <Col md={4}><Form.Group><Form.Label>Bairro</Form.Label><Form.Control value={value.neighborhood || ""} onChange={(e) => set("neighborhood", e.target.value)} /></Form.Group></Col>
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
