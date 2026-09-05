import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import appApiClient from "../../services/AppApiClient";

const pad = (value) => String(value).padStart(2, "0");
const toLocalInput = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const dateKey = (value) => toLocalInput(value).slice(0, 10);

const suggestedStart = (sourceStart) => {
  const source = new Date(sourceStart);
  const candidate = Number.isNaN(source.getTime()) ? new Date() : new Date(source);
  candidate.setDate(candidate.getDate() + 7);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setSeconds(0, 0);
  if (candidate <= tomorrow) {
    candidate.setTime(tomorrow.getTime());
    if (!Number.isNaN(source.getTime())) candidate.setHours(source.getHours(), source.getMinutes(), 0, 0);
  }
  return candidate;
};

const buildForm = (source) => {
  const originalStart = new Date(source.start_date);
  const originalEnd = new Date(source.end_date);
  const start = suggestedStart(source.start_date);
  const duration = !Number.isNaN(originalStart.getTime()) && !Number.isNaN(originalEnd.getTime())
    ? Math.max(originalEnd.getTime() - originalStart.getTime(), 60 * 60 * 1000)
    : 2 * 60 * 60 * 1000;
  const end = new Date(start.getTime() + duration);

  return {
    title: source.title || "",
    description: source.description || "",
    category: source.category || "",
    event_format: source.event_format || "in_person",
    start_date: toLocalInput(start),
    end_date: toLocalInput(end),
    venue: source.venue || "",
    address: source.address || "",
    google_maps_url: source.google_maps_url || "",
    city: source.city || "",
    uf: String(source.uf || "").toUpperCase().slice(0, 2),
    online_platform: source.online_platform || "",
    online_url: source.online_url || "",
    max_attendees: source.max_attendees ?? "",
    contact_email: source.contact_email || "",
    contact_phone: source.contact_phone || "",
    is_private: Boolean(source.is_private),
    requires_approval: Boolean(source.requires_approval),
    approval_message: source.approval_message || "",
  };
};

const firstApiError = (err) => {
  const payload = err?.response?.data || err;
  const errors = payload?.errors || {};
  const first = Object.values(errors).flat()?.[0];
  return first || payload?.message || "Não foi possível duplicar o evento.";
};

export default function EventDuplicatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    eventService.show(id)
      .then((event) => {
        if (!active) return;
        setSource(event);
        setForm(buildForm(event));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar o evento original."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const physical = ["in_person", "hybrid"].includes(form?.event_format);
  const online = ["online", "hybrid"].includes(form?.event_format);
  const sourceDate = useMemo(() => dateKey(source?.start_date), [source?.start_date]);

  const patch = (values) => {
    setForm((current) => ({ ...current, ...values }));
    setError("");
  };

  const changeStart = (value) => {
    setForm((current) => {
      if (!current) return current;
      const previousStart = new Date(current.start_date);
      const previousEnd = new Date(current.end_date);
      const nextStart = new Date(value);
      const duration = !Number.isNaN(previousStart.getTime()) && !Number.isNaN(previousEnd.getTime())
        ? Math.max(previousEnd.getTime() - previousStart.getTime(), 60 * 60 * 1000)
        : 2 * 60 * 60 * 1000;
      return {
        ...current,
        start_date: value,
        end_date: Number.isNaN(nextStart.getTime()) ? current.end_date : toLocalInput(new Date(nextStart.getTime() + duration)),
      };
    });
    setError("");
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form || !source) return;

    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    const targetDate = dateKey(form.start_date);

    if (form.title.trim().length < 2 || !form.description.trim()) {
      setError("Informe o nome e a descrição do novo evento.");
      return;
    }
    if (!targetDate || targetDate === sourceDate) {
      setError("Escolha uma data diferente da data do evento original.");
      return;
    }
    if (Number.isNaN(start.getTime()) || start <= new Date()) {
      setError("O início da cópia precisa ficar no futuro.");
      return;
    }
    if (Number.isNaN(end.getTime()) || end <= start) {
      setError("O término da cópia precisa ser posterior ao início.");
      return;
    }
    if (physical && (!form.address.trim() || !form.city.trim() || form.uf.trim().length !== 2)) {
      setError("Eventos presenciais precisam de endereço, cidade e UF.");
      return;
    }
    if (online && !form.online_url.trim()) {
      setError("Informe a URL de acesso para eventos online ou híbridos.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        date: targetDate,
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category.trim() || null,
        event_format: form.event_format,
        start_date: form.start_date,
        end_date: form.end_date,
        venue: form.venue.trim() || null,
        address: form.address.trim() || null,
        google_maps_url: form.google_maps_url.trim() || null,
        city: form.city.trim() || null,
        uf: form.uf.trim().toUpperCase() || null,
        online_platform: form.online_platform.trim() || null,
        online_url: form.online_url.trim() || null,
        max_attendees: form.max_attendees === "" ? null : Number(form.max_attendees),
        contact_email: form.contact_email.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        is_private: Boolean(form.is_private),
        requires_approval: Boolean(form.requires_approval),
        approval_message: form.requires_approval ? (form.approval_message.trim() || null) : null,
      };
      const response = (await appApiClient.post(`/events/${source.id}/duplicate`, payload)).data;
      const newId = Number(response?.event?.id || 0);
      if (!newId) throw new Error("A API não retornou o novo evento duplicado.");
      navigate(`/event/edit/${newId}`, { replace: true, state: { duplicateSuccess: response?.message || "Evento duplicado como rascunho." } });
    } catch (err) {
      setError(firstApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || saving) && <ProcessingIndicatorComponent label={saving ? "Criando cópia do evento" : "Carregando evento"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor / duplicação</span>
            <h1>Revise antes de duplicar</h1>
            <p>Altere o que for necessário. A cópia só será criada quando você confirmar no final desta página.</p>
          </div>
          <Button variant="outline-light" onClick={() => navigate("/event/manage")} disabled={saving}>Cancelar</Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {!loading && source && form && <Form onSubmit={submit} noValidate>
          <Alert variant="info">
            <strong>Você está duplicando “{source.title}”.</strong> A capa, os lotes de ingresso e o line-up serão copiados. Vendas, passes, participantes, check-ins, avaliações e interações não serão copiados. O novo evento continuará como rascunho.
          </Alert>

          <Row className="g-4">
            <Col lg={8}>
              <Card className="cut-panel h-100"><Card.Body className="p-4 p-lg-5">
                <div className="d-flex justify-content-between gap-3 align-items-start mb-4">
                  <div><span className="cut-eyebrow">Dados editáveis</span><h2 className="cut-section-title mt-2">Informações do novo evento</h2></div>
                  <Badge bg="secondary">Rascunho</Badge>
                </div>
                <Row className="g-3">
                  <Col xs={12}><Form.Group><Form.Label>Nome do evento *</Form.Label><Form.Control value={form.title} onChange={(e) => patch({ title: e.target.value })} required /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Categoria</Form.Label><Form.Control value={form.category} onChange={(e) => patch({ category: e.target.value })} /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Formato</Form.Label><Form.Select value={form.event_format} onChange={(e) => patch({ event_format: e.target.value })}><option value="in_person">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></Form.Select></Form.Group></Col>
                  <Col xs={12}><Form.Group><Form.Label>Descrição *</Form.Label><Form.Control as="textarea" rows={6} value={form.description} onChange={(e) => patch({ description: e.target.value })} required /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Início *</Form.Label><Form.Control type="datetime-local" value={form.start_date} onChange={(e) => changeStart(e.target.value)} required /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Término *</Form.Label><Form.Control type="datetime-local" value={form.end_date} onChange={(e) => patch({ end_date: e.target.value })} required /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Capacidade</Form.Label><Form.Control type="number" min="0" value={form.max_attendees} onChange={(e) => patch({ max_attendees: e.target.value })} /></Form.Group></Col>
                </Row>
              </Card.Body></Card>
            </Col>

            <Col lg={4}>
              <Card className="cut-panel h-100"><Card.Body className="p-4">
                <span className="cut-eyebrow">Herança da cópia</span>
                <h2 className="cut-section-title mt-2">O que permanece</h2>
                <div className="cut-info-box mt-3"><strong>Produção</strong><span>{source.production?.name || "Mesma produção do evento original"}</span></div>
                <div className="cut-info-box mt-3"><strong>Ingressos e line-up</strong><span>Os lotes e artistas serão clonados e seus horários/prazos serão deslocados conforme o novo início escolhido.</span></div>
                <div className="cut-info-box mt-3"><strong>Capa</strong><span>A imagem do evento original será copiada de forma independente. Depois da criação, você ainda poderá trocá-la no editor normal.</span></div>
              </Card.Body></Card>
            </Col>
          </Row>

          <Card className="cut-panel mt-4"><Card.Body className="p-4 p-lg-5">
            <h2 className="cut-section-title">Local e acesso</h2>
            <Row className="g-3 mt-1">
              {physical && <>
                <Col md={6}><Form.Group><Form.Label>Local</Form.Label><Form.Control value={form.venue} onChange={(e) => patch({ venue: e.target.value })} /></Form.Group></Col>
                <Col md={6}><Form.Group><Form.Label>Endereço *</Form.Label><Form.Control value={form.address} onChange={(e) => patch({ address: e.target.value })} /></Form.Group></Col>
                <Col md={8}><Form.Group><Form.Label>Google Maps</Form.Label><Form.Control type="url" value={form.google_maps_url} onChange={(e) => patch({ google_maps_url: e.target.value })} placeholder="https://" /></Form.Group></Col>
                <Col md={3}><Form.Group><Form.Label>Cidade *</Form.Label><Form.Control value={form.city} onChange={(e) => patch({ city: e.target.value })} /></Form.Group></Col>
                <Col md={1}><Form.Group><Form.Label>UF *</Form.Label><Form.Control maxLength={2} value={form.uf} onChange={(e) => patch({ uf: e.target.value.toUpperCase().slice(0, 2) })} /></Form.Group></Col>
              </>}
              {online && <>
                <Col md={6}><Form.Group><Form.Label>Plataforma online</Form.Label><Form.Control value={form.online_platform} onChange={(e) => patch({ online_platform: e.target.value })} /></Form.Group></Col>
                <Col md={6}><Form.Group><Form.Label>URL online *</Form.Label><Form.Control type="url" value={form.online_url} onChange={(e) => patch({ online_url: e.target.value })} placeholder="https://" /></Form.Group></Col>
              </>}
              <Col md={6}><Form.Group><Form.Label>E-mail de contato</Form.Label><Form.Control type="email" value={form.contact_email} onChange={(e) => patch({ contact_email: e.target.value })} /></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control value={form.contact_phone} onChange={(e) => patch({ contact_phone: e.target.value })} /></Form.Group></Col>
            </Row>
          </Card.Body></Card>

          <Card className="cut-panel mt-4"><Card.Body className="p-4 p-lg-5">
            <h2 className="cut-section-title">Privacidade e aprovação</h2>
            <Row className="g-3 mt-1">
              <Col md={6}><Form.Check type="switch" id="duplicate-private" label="Evento privado" checked={form.is_private} onChange={(e) => patch({ is_private: e.target.checked })} /></Col>
              <Col md={6}><Form.Check type="switch" id="duplicate-approval" label="Exigir aprovação de participantes" checked={form.requires_approval} onChange={(e) => patch({ requires_approval: e.target.checked })} /></Col>
              {form.requires_approval && <Col xs={12}><Form.Group><Form.Label>Mensagem de aprovação</Form.Label><Form.Control as="textarea" rows={3} value={form.approval_message} onChange={(e) => patch({ approval_message: e.target.value })} /></Form.Group></Col>}
            </Row>
          </Card.Body></Card>

          <div className="d-flex flex-column flex-sm-row justify-content-end gap-2 mt-4">
            <Button type="button" variant="outline-light" onClick={() => navigate("/event/manage")} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}><i className="fa-regular fa-copy me-2" />{saving ? "Criando cópia…" : "Criar cópia com estes dados"}</Button>
          </div>
        </Form>}
      </Container>
    </div>
  );
}
