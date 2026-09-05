import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";

const emptyForm = {
  title: "",
  message: "",
  level: "info",
  audience: "all",
  is_pinned: false,
  send_notification: true,
  starts_at: "",
  ends_at: "",
};

const levelMeta = {
  info: { label: "Informação", variant: "secondary" },
  update: { label: "Atualização", variant: "info" },
  warning: { label: "Atenção", variant: "warning" },
  critical: { label: "Urgente", variant: "danger" },
};

const audienceLabels = {
  all: "Todos relacionados ao evento",
  interested: "Pessoas interessadas",
  attendees: "Participantes com ingresso",
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
  : "—";

const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const toPayloadDate = (value) => value ? new Date(value).toISOString() : null;

export default function EventAnnouncementsManagePage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    const response = await cutinappService.manageEventAnnouncements(eventId);
    setEvent(response?.event || null);
    setAnnouncements(response?.announcements || []);
  }, [eventId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    cutinappService.manageEventAnnouncements(eventId)
      .then((response) => {
        if (!active) return;
        setEvent(response?.event || null);
        setAnnouncements(response?.announcements || []);
      })
      .catch((err) => active && setError(err?.message || "Não foi possível abrir a central de avisos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [eventId]);

  const preview = useMemo(() => ({
    title: form.title.trim() || "Título do aviso",
    message: form.message.trim() || "A mensagem aparecerá aqui exatamente como o público verá.",
    meta: levelMeta[form.level] || levelMeta.info,
  }), [form]);

  const change = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
  };

  const edit = (announcement) => {
    setEditingId(announcement.id);
    setForm({
      title: announcement.title || "",
      message: announcement.message || "",
      level: announcement.level || "info",
      audience: announcement.audience || "all",
      is_pinned: Boolean(announcement.is_pinned),
      send_notification: Boolean(announcement.send_notification),
      starts_at: toLocalInput(announcement.starts_at),
      ends_at: toLocalInput(announcement.ends_at),
    });
    setError("");
    setSuccess("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (eventSubmit) => {
    eventSubmit.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        ...form,
        starts_at: toPayloadDate(form.starts_at),
        ends_at: toPayloadDate(form.ends_at),
      };
      const response = editingId
        ? await cutinappService.updateEventAnnouncement(eventId, editingId, payload)
        : await cutinappService.createEventAnnouncement(eventId, payload);
      await load();
      reset();
      setSuccess(response?.message || "Aviso salvo.");
    } catch (err) {
      setError(err?.message || "Não foi possível salvar o aviso.");
    } finally {
      setBusy(false);
    }
  };

  const publication = async (announcement) => {
    setBusyId(announcement.id);
    setError("");
    setSuccess("");
    try {
      const response = announcement.published_at
        ? await cutinappService.unpublishEventAnnouncement(eventId, announcement.id)
        : await cutinappService.publishEventAnnouncement(eventId, announcement.id);
      await load();
      setSuccess(response?.message || "Situação do aviso atualizada.");
    } catch (err) {
      setError(err?.message || "Não foi possível alterar a publicação do aviso.");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (announcement) => {
    if (!window.confirm(`Excluir o aviso “${announcement.title}”?`)) return;
    setBusyId(announcement.id);
    setError("");
    try {
      const response = await cutinappService.deleteEventAnnouncement(eventId, announcement.id);
      await load();
      if (editingId === announcement.id) reset();
      setSuccess(response?.message || "Aviso excluído.");
    } catch (err) {
      setError(err?.message || "Não foi possível excluir o aviso.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || busy) && <ProcessingIndicatorComponent label={loading ? "Carregando central de avisos" : "Salvando aviso"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Operação do evento</span>
            <h1>Central de avisos</h1>
            <p>{event?.title || "Gerencie comunicados oficiais, segmentação e alertas do público."}</p>
          </div>
          <div className="d-flex flex-wrap gap-2">
            {event?.slug && event?.is_published && <Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}#avisos-oficiais`)}>Ver página pública</Button>}
            <Button variant="outline-light" onClick={() => navigate("/event/manage")}>Voltar aos eventos</Button>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
        {event && !event.is_published && <Alert variant="warning"><strong>Evento ainda não publicado.</strong> Você pode preparar os avisos agora, mas eles só poderão ser publicados depois que o evento estiver público.</Alert>}
        {event?.is_cancelled && <Alert variant="danger">Este evento está cancelado. Novos avisos não podem ser publicados enquanto ele permanecer cancelado.</Alert>}

        <Row className="g-4 align-items-start">
          <Col xl={7}>
            <Card className="cut-panel">
              <Card.Body className="p-4 p-lg-5">
                <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
                  <div><span className="cut-eyebrow">{editingId ? "Editando" : "Novo comunicado"}</span><h2 className="cut-section-title mt-2 mb-0">{editingId ? "Atualizar aviso" : "Criar aviso oficial"}</h2></div>
                  {editingId && <Button variant="outline-light" size="sm" onClick={reset}>Cancelar edição</Button>}
                </div>

                <Form onSubmit={save}>
                  <Row className="g-3">
                    <Col md={8}><Form.Group><Form.Label>Título</Form.Label><Form.Control value={form.title} onChange={(e) => change("title", e.target.value)} maxLength={140} required placeholder="Ex.: Portões abrem às 21h" /></Form.Group></Col>
                    <Col md={4}><Form.Group><Form.Label>Nível</Form.Label><Form.Select value={form.level} onChange={(e) => change("level", e.target.value)}><option value="info">Informação</option><option value="update">Atualização</option><option value="warning">Atenção</option><option value="critical">Urgente</option></Form.Select></Form.Group></Col>
                    <Col xs={12}><Form.Group><Form.Label>Mensagem</Form.Label><Form.Control as="textarea" rows={5} value={form.message} onChange={(e) => change("message", e.target.value)} maxLength={5000} required placeholder="Explique de forma objetiva o que o público precisa saber." /><Form.Text>{form.message.length}/5000 caracteres</Form.Text></Form.Group></Col>
                    <Col md={6}><Form.Group><Form.Label>Público da notificação</Form.Label><Form.Select value={form.audience} onChange={(e) => change("audience", e.target.value)}><option value="all">Todos relacionados ao evento</option><option value="interested">Pessoas interessadas</option><option value="attendees">Participantes com ingresso</option></Form.Select><Form.Text>“Todos” combina participantes, interessados e seguidores da produção, sem duplicar usuários.</Form.Text></Form.Group></Col>
                    <Col md={6}><div className="d-grid gap-3 pt-md-4"><Form.Check type="switch" id="announcement-pinned" checked={form.is_pinned} onChange={(e) => change("is_pinned", e.target.checked)} label="Fixar no topo da página do evento" /><Form.Check type="switch" id="announcement-notification" checked={form.send_notification} onChange={(e) => change("send_notification", e.target.checked)} label="Enviar notificação ao publicar" /></div></Col>
                    <Col md={6}><Form.Group><Form.Label>Exibir a partir de</Form.Label><Form.Control type="datetime-local" value={form.starts_at} onChange={(e) => change("starts_at", e.target.value)} /><Form.Text>Opcional. Deixe vazio para aparecer assim que for publicado.</Form.Text></Form.Group></Col>
                    <Col md={6}><Form.Group><Form.Label>Ocultar automaticamente em</Form.Label><Form.Control type="datetime-local" value={form.ends_at} min={form.starts_at || undefined} onChange={(e) => change("ends_at", e.target.value)} /><Form.Text>Opcional. Útil para avisos temporários.</Form.Text></Form.Group></Col>
                  </Row>

                  <Card className="mt-4 bg-dark border-secondary"><Card.Body><div className="d-flex flex-wrap gap-2 mb-2"><Badge bg={preview.meta.variant}>{preview.meta.label}</Badge>{form.is_pinned && <Badge bg="dark">Fixado</Badge>}<Badge bg="dark">{audienceLabels[form.audience]}</Badge></div><strong className="d-block mb-2">{preview.title}</strong><p className="mb-0 text-secondary" style={{ whiteSpace: "pre-wrap" }}>{preview.message}</p></Card.Body></Card>

                  <div className="d-flex flex-wrap gap-2 mt-4"><Button type="submit" disabled={busy}><i className="fa-solid fa-floppy-disk me-2" />{editingId ? "Salvar alterações" : "Criar rascunho"}</Button>{editingId && <Button variant="outline-light" onClick={reset}>Novo aviso</Button>}</div>
                </Form>
              </Card.Body>
            </Card>
          </Col>

          <Col xl={5}>
            <Card className="cut-panel">
              <Card.Body className="p-4">
                <div className="d-flex justify-content-between align-items-center gap-2 mb-3"><div><span className="cut-eyebrow">Histórico</span><h2 className="cut-section-title mt-2 mb-0">Avisos do evento</h2></div><Badge bg="dark">{announcements.length}</Badge></div>
                {announcements.length === 0 ? <div className="cut-empty-state-inline"><p className="mb-0">Nenhum aviso criado ainda.</p></div> : <div className="d-grid gap-3">{announcements.map((announcement) => {
                  const meta = levelMeta[announcement.level] || levelMeta.info;
                  const published = Boolean(announcement.published_at);
                  return <Card key={announcement.id} className="bg-dark border-secondary"><Card.Body>
                    <div className="d-flex flex-wrap gap-2 mb-2"><Badge bg={meta.variant}>{meta.label}</Badge><Badge bg={published ? "success" : "secondary"}>{published ? "Publicado" : "Rascunho"}</Badge>{announcement.is_pinned && <Badge bg="dark">Fixado</Badge>}</div>
                    <strong className="d-block mb-2">{announcement.title}</strong><p className="text-secondary small mb-3" style={{ whiteSpace: "pre-wrap" }}>{announcement.message}</p>
                    <small className="d-block text-secondary mb-3">Público: {audienceLabels[announcement.audience] || announcement.audience}<br />Criado: {formatDate(announcement.created_at)}{published ? <><br />Publicado: {formatDate(announcement.published_at)}</> : null}{announcement.ends_at ? <><br />Expira: {formatDate(announcement.ends_at)}</> : null}</small>
                    <div className="d-flex flex-wrap gap-2"><Button size="sm" variant="outline-light" onClick={() => edit(announcement)}>Editar</Button><Button size="sm" variant={published ? "outline-warning" : "outline-success"} onClick={() => publication(announcement)} disabled={busyId === announcement.id || (!published && (!event?.is_published || event?.is_cancelled))}>{published ? "Retirar" : "Publicar"}</Button><Button size="sm" variant="outline-danger" onClick={() => remove(announcement)} disabled={busyId === announcement.id}>Excluir</Button></div>
                  </Card.Body></Card>;
                })}</div>}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
