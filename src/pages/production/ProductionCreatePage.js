import React, { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import LocationFields from "../../components/location/LocationFields";
import OrganizationTaxonomyFields from "../../components/organizations/OrganizationTaxonomyFields";
import cutinappService from "../../services/CutinappService";

const initialForm = {
  name: "",
  fantasy: "",
  type: "company",
  roles: ["producer"],
  cnpj: "",
  phone: "",
  description: "",
  city_id: "",
  city: "",
  uf: "",
  cep: "",
  address: "",
  address_number: "",
  neighborhood: "",
  address_complement: "",
  address_reference: "",
  location_public: 0,
  website_url: "",
  instagram_url: "",
  logo: null,
  background: null,
};

const normalizeCnpj = (value) => String(value || "").replace(/\D/g, "");

const appendFormValue = (payload, key, value) => {
  if (Array.isArray(value)) {
    value.forEach((item) => payload.append(`${key}[]`, item));
    return;
  }
  if (value !== null && value !== undefined && String(value).trim() !== "") payload.append(key, value);
};

export default function ProductionCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [logoPreview, setLogoPreview] = useState("");
  const [backgroundPreview, setBackgroundPreview] = useState("");

  const cnpjDigits = normalizeCnpj(form.cnpj);
  const cnpjInvalid = submitted && cnpjDigits !== "" && cnpjDigits.length !== 14;
  const locationInvalid = submitted && Boolean((form.city || form.uf) && !form.city_id);
  const canSubmit = useMemo(() => form.name.trim().length >= 2 && form.roles.length > 0 && !loading, [form.name, form.roles, loading]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const chooseImage = (field, event) => {
    const file = event.target.files?.[0] || null;
    setForm((current) => ({ ...current, [field]: file }));
    const setter = field === "logo" ? setLogoPreview : setBackgroundPreview;
    setter(file ? URL.createObjectURL(file) : "");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setFieldErrors({});
    if (!canSubmit || cnpjInvalid || locationInvalid) {
      setError(locationInvalid ? "Selecione a cidade pela lista oficial antes de continuar." : "Revise os campos destacados antes de continuar.");
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => appendFormValue(payload, key, value));
      const response = await cutinappService.createProduction(payload);
      const id = Number(response?.production?.id || 0);
      if (!id) throw new Error("A organização foi criada, mas não conseguimos abrir seus dados.");

      await cutinappService.updateProductionExperience(id, {
        type: form.type,
        roles: form.roles,
        city_id: form.city_id || null,
        city: form.city || null,
        uf: form.uf || null,
        cep: form.cep || null,
        address: form.address || null,
        address_number: form.address_number || null,
        neighborhood: form.neighborhood || null,
        address_complement: form.address_complement || null,
        address_reference: form.address_reference || null,
        location_public: Boolean(form.location_public),
      });
      navigate(`/production/${id}`, { replace: true, state: { created: true } });
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível criar a organização.");
    } finally {
      setLoading(false);
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    {loading && <ProcessingIndicatorComponent label="Criando organização" />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading">
        <div>
          <span className="cut-eyebrow">Área do produtor</span>
          <h1>Cadastre sua organização</h1>
          <p>Produtoras, casas, coletivos e produtores independentes usam a mesma estrutura e podem acumular diferentes atuações.</p>
        </div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      <Form onSubmit={submit} noValidate>
        <Row className="g-4">
          <Col lg={8}>
            <Card className="cut-panel">
              <Card.Body className="p-4">
                <h2 className="cut-section-title">Informações principais</h2>
                <Row className="g-3">
                  <Col md={8}><Form.Group><Form.Label>Nome *</Form.Label><Form.Control name="name" value={form.name} onChange={change} isInvalid={submitted && form.name.trim().length < 2} /></Form.Group></Col>
                  <Col md={4}><Form.Group><Form.Label>CNPJ</Form.Label><Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={cnpjInvalid} /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Nome fantasia</Form.Label><Form.Control name="fantasy" value={form.fantasy} onChange={change} /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} /></Form.Group></Col>
                  <OrganizationTaxonomyFields value={form} onChange={setForm} />
                  <Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={4} name="description" value={form.description} onChange={change} /></Form.Group></Col>
                </Row>

                <h2 className="cut-section-title mt-4">Localização comercial</h2>
                <LocationFields value={form} onChange={setForm} showPublicToggle />
                <Row className="g-3 mt-1">
                  <Col md={6}><Form.Group><Form.Label>Site</Form.Label><Form.Control name="website_url" value={form.website_url} onChange={change} /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control name="instagram_url" value={form.instagram_url} onChange={change} /></Form.Group></Col>
                </Row>
                {Object.keys(fieldErrors).length > 0 && <Alert variant="warning" className="mt-3">{Object.values(fieldErrors).flat().map((item, index) => <div key={index}>{item}</div>)}</Alert>}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={4}>
            <Card className="cut-panel">
              <Card.Body className="p-4">
                <h2 className="cut-section-title">Identidade visual</h2>
                {logoPreview && <img className="cut-upload-preview cut-upload-preview--logo" src={logoPreview} alt="Prévia da logo" />}
                <Form.Label>Logo</Form.Label>
                <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage("logo", event)} />
                {backgroundPreview && <img className="cut-upload-preview mt-4" src={backgroundPreview} alt="Prévia da capa" />}
                <Form.Label className="mt-3">Capa</Form.Label>
                <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage("background", event)} />
              </Card.Body>
            </Card>
          </Col>
        </Row>
        <div className="cut-form-actions mt-4">
          <Button variant="outline-light" type="button" onClick={() => navigate("/production/mine")}>Cancelar</Button>
          <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar organização"}</Button>
        </div>
      </Form>
    </Container>
  </div>;
}
