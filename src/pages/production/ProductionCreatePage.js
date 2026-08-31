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

export default function ProductionCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [backgroundPreview, setBackgroundPreview] = useState("");

  const canSubmit = useMemo(
    () => form.name.trim().length >= 2 && !loading,
    [form.name, loading]
  );

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const chooseImage = (field, event) => {
    const file = event.target.files?.[0] || null;
    setForm((current) => ({ ...current, [field]: file }));
    const setter = field === "logo" ? setLogoPreview : setBackgroundPreview;
    setter(file ? URL.createObjectURL(file) : "");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");

    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== "") payload.append(key, value);
      });

      const response = await cutinappService.createProduction(payload);
      const productionId = response.production?.id;
      navigate(productionId ? `/event/create?productionId=${productionId}` : "/dashboard", {
        replace: true,
      });
    } catch (err) {
      setError(err?.message || "Não foi possível criar a produção.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Criando produção" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Crie sua produção</h1>
            <p>Cadastre a marca responsável pelos seus eventos. Depois você já poderá criar o primeiro evento e liberar cortesias.</p>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Form onSubmit={submit}>
          <Row className="g-4">
            <Col lg={8}>
              <Card className="cut-panel h-100">
                <Card.Body className="p-4">
                  <h2 className="cut-section-title">Informações principais</h2>
                  <Row className="g-3">
                    <Col md={8}>
                      <Form.Group>
                        <Form.Label>Nome da produção *</Form.Label>
                        <Form.Control name="name" value={form.name} onChange={change} placeholder="Ex.: Peter Eventos" required />
                      </Form.Group>
                    </Col>
                    <Col md={4}>
                      <Form.Group>
                        <Form.Label>CNPJ</Form.Label>
                        <Form.Control name="cnpj" value={form.cnpj} onChange={change} placeholder="Opcional" />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Nome fantasia</Form.Label>
                        <Form.Control name="fantasy" value={form.fantasy} onChange={change} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Telefone</Form.Label>
                        <Form.Control name="phone" value={form.phone} onChange={change} />
                      </Form.Group>
                    </Col>
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label>Descrição</Form.Label>
                        <Form.Control as="textarea" rows={4} name="description" value={form.description} onChange={change} placeholder="Conte rapidamente quem organiza os eventos." />
                      </Form.Group>
                    </Col>
                    <Col md={7}>
                      <Form.Group>
                        <Form.Label>Endereço</Form.Label>
                        <Form.Control name="address" value={form.address} onChange={change} />
                      </Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group>
                        <Form.Label>Cidade</Form.Label>
                        <Form.Control name="city" value={form.city} onChange={change} />
                      </Form.Group>
                    </Col>
                    <Col md={2}>
                      <Form.Group>
                        <Form.Label>UF</Form.Label>
                        <Form.Control maxLength={2} name="uf" value={form.uf} onChange={change} />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Site</Form.Label>
                        <Form.Control type="url" name="website_url" value={form.website_url} onChange={change} placeholder="https://" />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label>Instagram</Form.Label>
                        <Form.Control type="url" name="instagram_url" value={form.instagram_url} onChange={change} placeholder="https://instagram.com/..." />
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
                  <Form.Group className="mb-4">
                    <Form.Label>Logo</Form.Label>
                    {logoPreview && <img className="cut-upload-preview cut-upload-preview--logo" src={logoPreview} alt="Prévia da logo" />}
                    <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage("logo", event)} />
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Capa</Form.Label>
                    {backgroundPreview && <img className="cut-upload-preview" src={backgroundPreview} alt="Prévia da capa" />}
                    <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseImage("background", event)} />
                  </Form.Group>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          <div className="cut-form-actions mt-4">
            <Button variant="outline-light" type="button" onClick={() => navigate("/dashboard")}>Cancelar</Button>
            <Button type="submit" disabled={!canSubmit}>Criar produção e continuar</Button>
          </div>
        </Form>
      </Container>
    </div>
  );
}
