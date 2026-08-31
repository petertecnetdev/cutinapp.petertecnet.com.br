import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function EventUpdatePage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(
    new URLSearchParams(location.search).get("courtesyCreated") === "1"
      ? "Cortesia criada. Revise o evento e publique quando estiver pronto."
      : ""
  );

  const loadEvent = async () => {
    const item = await eventService.show(id);
    setEventData(item);
    setForm({
      production_id: item.production_id,
      title: item.title || "",
      description: item.description || "",
      venue: item.venue || "",
      address: item.address || "",
      city: item.city || "",
      uf: item.uf || "",
      start_date: toLocalInput(item.start_date),
      end_date: toLocalInput(item.end_date),
      max_attendees: item.max_attendees ?? "",
      contact_email: item.contact_email || "",
      contact_phone: item.contact_phone || "",
    });
    setPreview(item.image ? `${storageUrl}${String(item.image).replace(/^\//, "")}` : "");
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    eventService.show(id)
      .then((item) => {
        if (!active) return;
        setEventData(item);
        setForm({
          production_id: item.production_id,
          title: item.title || "",
          description: item.description || "",
          venue: item.venue || "",
          address: item.address || "",
          city: item.city || "",
          uf: item.uf || "",
          start_date: toLocalInput(item.start_date),
          end_date: toLocalInput(item.end_date),
          max_attendees: item.max_attendees ?? "",
          contact_email: item.contact_email || "",
          contact_phone: item.contact_phone || "",
        });
        setPreview(item.image ? `${storageUrl}${String(item.image).replace(/^\//, "")}` : "");
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar o evento."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const canSave = useMemo(() => Boolean(
    form &&
    form.title.trim() &&
    form.description.trim() &&
    form.address.trim() &&
    form.start_date &&
    form.end_date &&
    !saving
  ), [form, saving]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === "uf" ? value.toUpperCase() : value }));
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0] || null;
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setImage(file);
    if (file) setPreview(URL.createObjectURL(file));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    if (new Date(form.end_date) < new Date(form.start_date)) {
      setError("A data de término não pode ser anterior ao início do evento.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== "") data.append(key, value);
      });
      if (image) data.append("image", image);
      const response = await eventService.update(id, data);
      setEventData(response.event);
      setSuccess("Alterações salvas com sucesso.");
    } catch (err) {
      setError(err?.message || "Não foi possível salvar o evento.");
    } finally {
      setSaving(false);
    }
  };

  const togglePublication = async () => {
    setPublishing(true);
    setError("");
    setSuccess("");
    try {
      const response = eventData?.is_published
        ? await cutinappService.unpublishEvent(id)
        : await cutinappService.publishEvent(id);
      setEventData(response.event);
      setSuccess(response.message || (response.event?.is_published ? "Evento publicado." : "Evento retirado da publicação."));
      await loadEvent();
    } catch (err) {
      setError(err?.message || "Não foi possível alterar a publicação do evento.");
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando evento" /></div>;
  }

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(saving || publishing) && <ProcessingIndicatorComponent label={publishing ? "Atualizando publicação" : "Salvando evento"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Gestão do evento</span>
            <h1>Editar evento</h1>
            <p>Informações, cortesias e publicação são controladas separadamente para evitar uma página incompleta no ar.</p>
          </div>
          <div className="cut-card-actions">
            <Button variant="outline-light" onClick={() => navigate("/event/manage")}>Voltar</Button>
            {eventData?.is_published && eventData?.slug && <Button variant="outline-light" onClick={() => navigate(`/event/${eventData.slug}`)}>Página pública</Button>}
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {form && <Form onSubmit={submit}>
          <Row className="g-4">
            <Col lg={8}>
              <Card className="cut-panel">
                <Card.Body className="p-4 p-lg-5">
                  <span className="cut-eyebrow">Apresentação</span>
                  <h2 className="cut-section-title mt-2">Informações principais</h2>
                  <Row className="g-3">
                    <Col xs={12}><Form.Group><Form.Label>Nome do evento *</Form.Label><Form.Control name="title" value={form.title} onChange={change} required /></Form.Group></Col>
                    <Col xs={12}><Form.Group><Form.Label>Descrição *</Form.Label><Form.Control as="textarea" rows={7} name="description" value={form.description} onChange={change} required /></Form.Group></Col>
                    <Col xs={12}><Form.Group><Form.Label>Imagem/capa</Form.Label>{preview && <img src={preview} className="cut-upload-preview cut-upload-preview--event" alt="Prévia" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} /></Form.Group></Col>
                    <Col md={6}><Form.Group><Form.Label>E-mail de contato</Form.Label><Form.Control type="email" name="contact_email" value={form.contact_email} onChange={change} /></Form.Group></Col>
                    <Col md={6}><Form.Group><Form.Label>Telefone de contato</Form.Label><Form.Control name="contact_phone" value={form.contact_phone} onChange={change} /></Form.Group></Col>
                  </Row>
                </Card.Body>
              </Card>
            </Col>

            <Col lg={4}>
              <Card className="cut-panel mb-4"><Card.Body className="p-4">
                <span className="cut-eyebrow">Agenda e local</span>
                <div className="d-grid gap-3 mt-3">
                  <Form.Group><Form.Label>Início *</Form.Label><Form.Control type="datetime-local" name="start_date" value={form.start_date} onChange={change} required /></Form.Group>
                  <Form.Group><Form.Label>Término *</Form.Label><Form.Control type="datetime-local" name="end_date" value={form.end_date} onChange={change} required /></Form.Group>
                  <Form.Group><Form.Label>Local</Form.Label><Form.Control name="venue" value={form.venue} onChange={change} /></Form.Group>
                  <Form.Group><Form.Label>Endereço *</Form.Label><Form.Control name="address" value={form.address} onChange={change} required /></Form.Group>
                  <Row className="g-2"><Col xs={8}><Form.Control name="city" placeholder="Cidade" value={form.city} onChange={change} /></Col><Col xs={4}><Form.Control name="uf" maxLength={2} placeholder="UF" value={form.uf} onChange={change} /></Col></Row>
                  <Form.Group><Form.Label>Capacidade</Form.Label><Form.Control type="number" min="0" name="max_attendees" value={form.max_attendees} onChange={change} /></Form.Group>
                  <Button type="submit" disabled={!canSave}>Salvar alterações</Button>
                </div>
              </Card.Body></Card>

              <Card className="cut-panel"><Card.Body className="p-4">
                <div className="d-flex justify-content-between gap-3 align-items-start">
                  <div><span className="cut-eyebrow">Publicação</span><h2 className="cut-section-title mt-2">{eventData?.is_published ? "Evento no ar" : "Evento em rascunho"}</h2></div>
                  <Badge bg={eventData?.is_published ? "success" : "secondary"}>{eventData?.is_published ? "Publicado" : "Rascunho"}</Badge>
                </div>
                <div className="cut-info-box mt-3"><strong>{eventData?.tickets_count || 0} lote(s) configurado(s)</strong><span>Para publicar, a API exige ao menos uma cortesia gratuita disponível e não expirada.</span></div>
                <div className="d-grid gap-2 mt-3">
                  <Button variant="outline-light" onClick={() => navigate(`/event/${id}/courtesies`)}>Gerenciar cortesias</Button>
                  <Button variant="outline-light" onClick={() => navigate(`/ticket/create?eventId=${id}`)}>Criar nova cortesia</Button>
                  <Button onClick={togglePublication} disabled={publishing || eventData?.is_cancelled}>{eventData?.is_published ? "Retirar da publicação" : "Publicar evento"}</Button>
                  {eventData?.is_published && <Button variant="outline-light" onClick={() => navigate(`/checkin?eventId=${id}`)}>Abrir portaria deste evento</Button>}
                </div>
              </Card.Body></Card>
            </Col>
          </Row>
        </Form>}
      </Container>
    </div>
  );
}
