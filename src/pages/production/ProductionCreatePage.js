import React, { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";

const initialForm = {
  name: "",
  fantasy: "",
  cnpj: "",
  phone: "",
  description: "",
  city: "",
  uf: "",
  address: "",
  website_url: "",
  instagram_url: "",
  logo: null,
  background: null,
};

const firstError = (errors, field) => {
  const value = errors?.[field];
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
};

const normalizeCnpj = (value) => String(value || "").replace(/\D/g, "");

export default function ProductionCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [logoPreview, setLogoPreview] = useState("");
  const [backgroundPreview, setBackgroundPreview] = useState("");

  const nameInvalid = submitted && form.name.trim().length < 2;
  const ufInvalid = submitted && form.uf.trim() !== "" && form.uf.trim().length !== 2;
  const cnpjDigits = normalizeCnpj(form.cnpj);
  const cnpjInvalid = submitted && cnpjDigits !== "" && cnpjDigits.length !== 14;

  const canSubmit = useMemo(
    () => form.name.trim().length >= 2 && !loading,
    [form.name, loading]
  );

  const change = (event) => {
    const { name, value } = event.target;
    const normalizedValue = name === "uf" ? value.toUpperCase().slice(0, 2) : value;
    setForm((current) => ({ ...current, [name]: normalizedValue }));
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
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    const setter = field === "logo" ? setLogoPreview : setBackgroundPreview;
    setter(file ? URL.createObjectURL(file) : "");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setFieldErrors({});

    if (!canSubmit || ufInvalid || cnpjInvalid) {
      setError("Revise os campos destacados antes de continuar.");
      return;
    }

    setLoading(true);

    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && String(value).trim() !== "") payload.append(key, value);
      });

      const response = await cutinappService.createProduction(payload);
      const productionId = Number(response?.production?.id || 0);
      if (!productionId) {
        throw new Error("A API informou sucesso, mas não retornou a produção criada.");
      }

      navigate(`/production/${productionId}`, {
        replace: true,
        state: { created: true },
      });
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível criar a produção.");
    } finally {
      setLoading(false);
    }
  };

  const invalid = (field, local = false) => Boolean(local || firstError(fieldErrors, field));

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Criando produção" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Crie sua produção</h1>
            <p>Cadastre a organização responsável pelos eventos. A Cutinapp vincula a produção ao aplicativo e ao seu usuário automaticamente.</p>
          </div>
        </div>

        {error && <Alert variant="danger" role="alert">{error}</Alert>}

        <Form onSubmit={submit} noValidate>
          <Row className="g-4">
            <Col lg={8}>
              <Card className="cut-panel h-100">
                <Card.Body className="p-4">
                  <h2 className="cut-section-title">Informações principais</h2>
                  <Row className="g-3">
                    <Col md={8}>
                      <Form.Group controlId="production-name">
                        <Form.Label>Nome da produção *</Form.Label>
                        <Form.Control name="name" value={form.name} onChange={change} placeholder="Ex.: Peter Eventos" isInvalid={invalid("name", nameInvalid)} autoFocus />
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "name") || "Informe um nome com pelo menos 2 caracteres."}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group controlId="production-cnpj">
                        <Form.Label>CNPJ</Form.Label>
                        <Form.Control name="cnpj" value={form.cnpj} onChange={change} placeholder="00.000.000/0000-00" inputMode="numeric" isInvalid={invalid("cnpj", cnpjInvalid)} />
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "cnpj") || "Se informar CNPJ, use os 14 números."}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="production-fantasy">
                        <Form.Label>Nome fantasia</Form.Label>
                        <Form.Control name="fantasy" value={form.fantasy} onChange={change} isInvalid={invalid("fantasy")} />
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "fantasy")}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="production-phone">
                        <Form.Label>Telefone</Form.Label>
                        <Form.Control name="phone" value={form.phone} onChange={change} inputMode="tel" isInvalid={invalid("phone")} />
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "phone")}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col xs={12}>
                      <Form.Group controlId="production-description">
                        <Form.Label>Descrição</Form.Label>
                        <Form.Control as="textarea" rows={4} name="description" value={form.description} onChange={change} placeholder="Conte rapidamente quem organiza os eventos." isInvalid={invalid("description")} />
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "description")}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={7}>
                      <Form.Group controlId="production-address">
                        <Form.Label>Endereço</Form.Label>
                        <Form.Control name="address" value={form.address} onChange={change} isInvalid={invalid("address")} />
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "address")}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group controlId="production-city">
                        <Form.Label>Cidade</Form.Label>
                        <Form.Control name="city" value={form.city} onChange={change} isInvalid={invalid("city")} />
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "city")}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={2}>
                      <Form.Group controlId="production-uf">
                        <Form.Label>UF</Form.Label>
                        <Form.Control maxLength={2} name="uf" value={form.uf} onChange={change} placeholder="SP" isInvalid={invalid("uf", ufInvalid)} />
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "uf") || "Use 2 letras."}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="production-site">
                        <Form.Label>Site</Form.Label>
                        <Form.Control type="text" name="website_url" value={form.website_url} onChange={change} placeholder="site.com.br ou https://site.com.br" inputMode="url" isInvalid={invalid("website_url")} />
                        <Form.Text>Você pode informar com ou sem https://.</Form.Text>
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "website_url")}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="production-instagram">
                        <Form.Label>Instagram</Form.Label>
                        <Form.Control type="text" name="instagram_url" value={form.instagram_url} onChange={change} placeholder="@usuario ou instagram.com/usuario" isInvalid={invalid("instagram_url")} />
                        <Form.Text>Aceitamos @usuário, perfil ou URL completa.</Form.Text>
                        <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "instagram_url")}</Form.Control.Feedback>
                      </Form.Group>
                    </Col>
                  </Row>
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4}>
              <Card className="cut-panel h-100">
                <Card.Body className="p-4">
                  <h2 className="cut-section-title">Identidade visual</h2>
                  <Form.Group className="mb-4" controlId="production-logo">
                    <Form.Label>Logo</Form.Label>
                    {logoPreview && <img className="cut-upload-preview cut-upload-preview--logo" src={logoPreview} alt="Prévia da logo" />}
                    <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage("logo", event)} isInvalid={invalid("logo")} />
                    <Form.Text>JPG, PNG ou WebP, até 5 MB.</Form.Text>
                    <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "logo")}</Form.Control.Feedback>
                  </Form.Group>
                  <Form.Group controlId="production-background">
                    <Form.Label>Capa</Form.Label>
                    {backgroundPreview && <img className="cut-upload-preview" src={backgroundPreview} alt="Prévia da capa" />}
                    <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage("background", event)} isInvalid={invalid("background")} />
                    <Form.Text>JPG, PNG ou WebP, até 10 MB.</Form.Text>
                    <Form.Control.Feedback type="invalid">{firstError(fieldErrors, "background")}</Form.Control.Feedback>
                  </Form.Group>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <div className="cut-form-actions mt-4">
            <Button variant="outline-light" type="button" disabled={loading} onClick={() => navigate("/production/mine")}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar produção"}</Button>
          </div>
        </Form>
      </Container>
    </div>
  );
}
