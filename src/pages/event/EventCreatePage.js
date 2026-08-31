import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";

const initialForm = {
  production_id: "",
  title: "",
  description: "",
  address: "",
  city: "",
  uf: "",
  venue: "",
  start_date: "",
  end_date: "",
  contact_email: "",
  contact_phone: "",
  image: null,
};

export default function EventCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState(initialForm);
  const [productions, setProductions] = useState([]);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProductions, setLoadingProductions] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const selectedProduction = new URLSearchParams(location.search).get("productionId") || "";

    cutinappService
      .myProductions()
      .then((items) => {
        if (!active) return;
        setProductions(items);
        const fallback = selectedProduction || (items.length === 1 ? String(items[0].id) : "");
        setForm((current) => ({ ...current, production_id: fallback }));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas produções."))
      .finally(() => active && setLoadingProductions(false));

    return () => {
      active = false;
    };
  }, [location.search]);

  const canSubmit = useMemo(
    () =>
      Boolean(
        form.production_id &&
          form.title.trim() &&
          form.description.trim() &&
          form.address.trim() &&
          form.start_date &&
          form.end_date
      ) && !loading,
    [form, loading]
  );

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0] || null;
    setForm((current) => ({ ...current, image: file }));
    setPreview(file ? URL.createObjectURL(file) : "");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    if (new Date(form.end_date) < new Date(form.start_date)) {
      setError("A data de término não pode ser anterior ao início do evento.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== "") payload.append(key, value);
      });
      payload.append("is_published", "1");
      payload.append("is_cancelled", "0");

      const response = await eventService.store(payload);
      const eventId = response.event?.id;
      navigate(eventId ? `/ticket/create?eventId=${eventId}` : "/dashboard", { replace: true });
    } catch (err) {
      setError(err?.message || "Não foi possível criar o evento.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || loadingProductions) && (
        <ProcessingIndicatorComponent label={loading ? "Criando evento" : "Carregando produções"} />
      )}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Novo evento</h1>
            <p>Cadastre as informações essenciais. Na próxima etapa você cria a cortesia gratuita e já pode começar a distribuir.</p>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {!loadingProductions && productions.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Primeiro crie uma produção</h2>
              <p>Todo evento precisa pertencer a uma produção responsável.</p>
              <Button onClick={() => navigate("/production/create")}>Criar produção</Button>
            </Card.Body>
          </Card>
        ) : (
          <Form onSubmit={submit}>
            <Row className="g-4">
              <Col lg={8}>
                <Card className="cut-panel h-100">
                  <Card.Body className="p-4">
                    <h2 className="cut-section-title">Evento</h2>
                    <Row className="g-3">
                      <Col xs={12}>
                        <Form.Group>
                          <Form.Label>Produção *</Form.Label>
                          <Form.Select name="production_id" value={form.production_id} onChange={change} required>
                            <option value="">Selecione</option>
                            {productions.map((production) => (
                              <option key={production.id} value={production.id}>{production.name}</option>
                            ))}
                          </Form.Select>
                        </Form.Group>
                      </Col>
                      <Col xs={12}>
                        <Form.Group>
                          <Form.Label>Nome do evento *</Form.Label>
                          <Form.Control name="title" value={form.title} onChange={change} required placeholder="Ex.: Noite de Lançamento" />
                        </Form.Group>
                      </Col>
                      <Col xs={12}>
                        <Form.Group>
                          <Form.Label>Descrição *</Form.Label>
                          <Form.Control as="textarea" rows={5} name="description" value={form.description} onChange={change} required />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Início *</Form.Label>
                          <Form.Control type="datetime-local" name="start_date" value={form.start_date} onChange={change} required />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Término *</Form.Label>
                          <Form.Control type="datetime-local" name="end_date" value={form.end_date} onChange={change} required />
                        </Form.Group>
                      </Col>
                      <Col md={5}>
                        <Form.Group>
                          <Form.Label>Local</Form.Label>
                          <Form.Control name="venue" value={form.venue} onChange={change} placeholder="Nome do espaço" />
                        </Form.Group>
                      </Col>
                      <Col md={7}>
                        <Form.Group>
                          <Form.Label>Endereço *</Form.Label>
                          <Form.Control name="address" value={form.address} onChange={change} required />
                        </Form.Group>
                      </Col>
                      <Col md={8}>
                        <Form.Group>
                          <Form.Label>Cidade</Form.Label>
                          <Form.Control name="city" value={form.city} onChange={change} />
                        </Form.Group>
                      </Col>
                      <Col md={4}>
                        <Form.Group>
                          <Form.Label>UF</Form.Label>
                          <Form.Control maxLength={2} name="uf" value={form.uf} onChange={change} />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>E-mail de contato</Form.Label>
                          <Form.Control type="email" name="contact_email" value={form.contact_email} onChange={change} />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group>
                          <Form.Label>Telefone de contato</Form.Label>
                          <Form.Control name="contact_phone" value={form.contact_phone} onChange={change} />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>

              <Col lg={4}>
                <Card className="cut-panel h-100">
                  <Card.Body className="p-4">
                    <h2 className="cut-section-title">Imagem do evento</h2>
                    {preview ? (
                      <img src={preview} alt="Prévia do evento" className="cut-upload-preview cut-upload-preview--event" />
                    ) : (
                      <div className="cut-upload-placeholder">
                        <i className="fa-regular fa-image" />
                        <span>Adicione uma capa 16:9</span>
                      </div>
                    )}
                    <Form.Control className="mt-3" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} />
                  </Card.Body>
                </Card>
              </Col>
            </Row>

            <div className="cut-form-actions mt-4">
              <Button type="button" variant="outline-light" onClick={() => navigate("/dashboard")}>Cancelar</Button>
              <Button type="submit" disabled={!canSubmit}>Criar evento e configurar cortesia</Button>
            </div>
          </Form>
        )}
      </Container>
    </div>
  );
}
