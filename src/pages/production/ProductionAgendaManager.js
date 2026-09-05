import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";
import "./production-agenda.css";

const DAYS = [
  { value: 1, label: "Segunda-feira", short: "Seg" },
  { value: 2, label: "Terça-feira", short: "Ter" },
  { value: 3, label: "Quarta-feira", short: "Qua" },
  { value: 4, label: "Quinta-feira", short: "Qui" },
  { value: 5, label: "Sexta-feira", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 0, label: "Domingo", short: "Dom" },
];

const DAY_ORDER = DAYS.reduce((result, day, index) => ({ ...result, [day.value]: index }), {});
const dayInfo = (value) => DAYS.find((day) => day.value === Number(value)) || DAYS[0];

const emptyForm = () => ({
  title: "",
  description: "",
  category: "",
  day_of_week: String(new Date().getDay()),
  start_time: "20:00",
  end_time: "23:00",
  venue: "",
  address: "",
  google_maps_url: "",
  city: "",
  uf: "",
  cep: "",
  latitude: "",
  longitude: "",
  max_attendees: "",
  contact_email: "",
  contact_phone: "",
  is_private: false,
  event_format: "in_person",
  online_url: "",
  image: null,
});

const imageUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const productionAddress = (production) => {
  if (!production) return "";
  if (production.formatted_address) return production.formatted_address;
  const street = [production.address, production.address_number].filter(Boolean).join(", ");
  const details = [production.neighborhood, production.address_complement].filter(Boolean).join(" - ");
  return [street, details].filter(Boolean).join(" · ") || production.location || "";
};

const apiError = (error, fallback) => {
  const errors = error?.response?.data?.errors;
  const validation = errors && Object.values(errors).flat().find(Boolean);
  return validation || error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
};

const formatNextDate = (event) => {
  if (!event?.start_date) return "";
  const date = new Date(event.start_date);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export default function ProductionAgendaManager({ production, show, onHide }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [agendaActive, setAgendaActive] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [togglingAgenda, setTogglingAgenda] = useState(false);
  const [togglingItemId, setTogglingItemId] = useState(null);
  const [generatingItemId, setGeneratingItemId] = useState(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);

  const sortedSchedules = useMemo(() => [...schedules].sort((a, b) => {
    const day = (DAY_ORDER[Number(a.day_of_week)] ?? 99) - (DAY_ORDER[Number(b.day_of_week)] ?? 99);
    if (day !== 0) return day;
    return String(a.start_time || "").localeCompare(String(b.start_time || ""));
  }), [schedules]);

  const activeCount = useMemo(() => schedules.filter((item) => item.is_active).length, [schedules]);

  useEffect(() => {
    if (!show || !production?.id) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    setSuccess("");
    setLastEvent(null);
    setFormOpen(false);

    eventService.agenda(production.id)
      .then((data) => {
        if (!active) return;
        setAgendaActive(data?.agenda?.is_active !== false);
        setSchedules(Array.isArray(data?.schedules) ? data.schedules : []);
      })
      .catch((err) => active && setError(apiError(err, "Não foi possível carregar a agenda semanal.")))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [show, production?.id]);

  const close = () => {
    if (saving || generatingAll || generatingItemId || deletingId) return;
    onHide?.();
  };

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setFormOpen(true);
  };

  const startEdit = (schedule) => {
    setEditing(schedule);
    setForm({
      ...emptyForm(),
      title: schedule.title || "",
      description: schedule.description || "",
      category: schedule.category || "",
      day_of_week: String(schedule.day_of_week),
      start_time: String(schedule.start_time || "").slice(0, 5),
      end_time: String(schedule.end_time || "").slice(0, 5),
      venue: schedule.venue || "",
      address: schedule.address || "",
      google_maps_url: schedule.google_maps_url || "",
      city: schedule.city || "",
      uf: schedule.uf || "",
      cep: schedule.cep || "",
      latitude: schedule.latitude || "",
      longitude: schedule.longitude || "",
      max_attendees: schedule.max_attendees || "",
      contact_email: schedule.contact_email || "",
      contact_phone: schedule.contact_phone || "",
      is_private: Boolean(schedule.is_private),
      event_format: schedule.event_format || "in_person",
      online_url: schedule.online_url || "",
      image: null,
    });
    setError("");
    setFormOpen(true);
  };

  const change = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : name === "uf" ? value.toUpperCase().slice(0, 2) : value,
    }));
  };

  const applyProduction = () => {
    setForm((current) => ({
      ...current,
      description: production?.description || current.description,
      venue: production?.fantasy || production?.name || current.venue,
      address: productionAddress(production) || current.address,
      google_maps_url: production?.google_maps_url || current.google_maps_url,
      city: production?.city || current.city,
      uf: String(production?.uf || current.uf || "").toUpperCase().slice(0, 2),
      cep: production?.cep || current.cep,
      latitude: production?.latitude || current.latitude,
      longitude: production?.longitude || current.longitude,
      max_attendees: production?.capacity || current.max_attendees,
      contact_email: production?.contact_email || production?.email || current.contact_email,
      contact_phone: production?.contact_phone || production?.phone || current.contact_phone,
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key === "image") return;
        if (typeof value === "boolean") payload.append(key, value ? "1" : "0");
        else payload.append(key, value ?? "");
      });
      if (form.image) payload.append("image", form.image);

      const response = editing
        ? await eventService.updateAgendaItem(editing.id, payload)
        : await eventService.createAgendaItem(production.id, payload);
      const saved = response?.schedule;
      if (!saved?.id) throw new Error("A API não retornou o item salvo da agenda.");

      setSchedules((current) => editing
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      setSuccess(response?.message || (editing ? "Evento da agenda atualizado." : "Evento adicionado à agenda."));
      setEditing(null);
      setForm(emptyForm());
      setFormOpen(false);
    } catch (err) {
      setError(apiError(err, "Não foi possível salvar este evento da agenda."));
    } finally {
      setSaving(false);
    }
  };

  const toggleAgenda = async () => {
    if (togglingAgenda) return;
    const next = !agendaActive;
    setTogglingAgenda(true);
    setError("");
    try {
      const response = await eventService.setAgendaStatus(production.id, next);
      setAgendaActive(response?.agenda?.is_active !== false);
      setSuccess(response?.message || (next ? "Agenda ativada." : "Agenda pausada."));
    } catch (err) {
      setError(apiError(err, "Não foi possível alterar o status da agenda."));
    } finally {
      setTogglingAgenda(false);
    }
  };

  const toggleItem = async (schedule) => {
    if (togglingItemId) return;
    setTogglingItemId(schedule.id);
    setError("");
    try {
      const response = await eventService.setAgendaItemStatus(schedule.id, !schedule.is_active);
      const updated = response?.schedule;
      if (updated?.id) setSchedules((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSuccess(response?.message || "Status atualizado.");
    } catch (err) {
      setError(apiError(err, "Não foi possível alterar este evento da agenda."));
    } finally {
      setTogglingItemId(null);
    }
  };

  const generateItem = async (schedule) => {
    if (generatingItemId) return;
    setGeneratingItemId(schedule.id);
    setError("");
    setSuccess("");
    setLastEvent(null);
    try {
      const response = await eventService.generateAgendaItem(schedule.id);
      setLastEvent(response?.event || null);
      setSuccess(response?.message || "Próxima ocorrência criada.");
    } catch (err) {
      setError(apiError(err, "Não foi possível criar a próxima ocorrência."));
    } finally {
      setGeneratingItemId(null);
    }
  };

  const generateAll = async () => {
    if (generatingAll) return;
    setGeneratingAll(true);
    setError("");
    setSuccess("");
    setLastEvent(null);
    try {
      const response = await eventService.generateAgendaUpcoming(production.id);
      const events = Array.isArray(response?.events) ? response.events : [];
      setLastEvent(events.length === 1 ? events[0] : null);
      setSuccess(response?.message || "Próximos eventos preparados.");
    } catch (err) {
      setError(apiError(err, "Não foi possível gerar os próximos eventos."));
    } finally {
      setGeneratingAll(false);
    }
  };

  const remove = async (schedule) => {
    if (deletingId) return;
    const confirmed = window.confirm(`Remover “${schedule.title}” da agenda semanal? Os eventos já criados não serão apagados.`);
    if (!confirmed) return;
    setDeletingId(schedule.id);
    setError("");
    try {
      const response = await eventService.deleteAgendaItem(schedule.id);
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
      setSuccess(response?.message || "Evento removido da agenda.");
      if (editing?.id === schedule.id) setFormOpen(false);
    } catch (err) {
      setError(apiError(err, "Não foi possível remover este evento da agenda."));
    } finally {
      setDeletingId(null);
    }
  };

  const physical = ["in_person", "hybrid"].includes(form.event_format);
  const online = ["online", "hybrid"].includes(form.event_format);

  return (
    <Modal show={show} onHide={close} size="xl" fullscreen="lg-down" centered className="cut-agenda-modal">
      <Modal.Header closeButton>
        <div className="cut-agenda-modal__title">
          <span className="cut-eyebrow">Agenda recorrente</span>
          <Modal.Title>Agenda semanal · {production?.name}</Modal.Title>
          <p>Cadastre uma vez os eventos fixos da semana e transforme a próxima edição em um evento normal da Cutinapp com um clique.</p>
        </div>
      </Modal.Header>

      <Modal.Body>
        {loading ? (
          <div className="cut-agenda-loading"><Spinner animation="border" /><span>Carregando agenda semanal...</span></div>
        ) : (
          <>
            {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
            {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

            {lastEvent?.id && (
              <Alert variant="info" className="cut-agenda-created-alert">
                <div>
                  <strong>{lastEvent.title}</strong>
                  <span>{formatNextDate(lastEvent) ? `Criado para ${formatNextDate(lastEvent)}. ` : ""}Ele é um evento normal em rascunho e pode ser editado antes da publicação.</span>
                </div>
                <div className="cut-agenda-created-alert__actions">
                  <Button size="sm" variant="outline-info" onClick={() => navigate(`/event/edit/${lastEvent.id}`)}>Editar evento</Button>
                  <Button size="sm" onClick={() => navigate(`/ticket/create?eventId=${lastEvent.id}`)}>Configurar ingressos</Button>
                </div>
              </Alert>
            )}

            <section className={`cut-agenda-control ${agendaActive ? "is-active" : "is-paused"}`}>
              <div className="cut-agenda-control__status">
                <div className="cut-agenda-control__icon"><i className="fa-solid fa-calendar-days" /></div>
                <div>
                  <div className="cut-agenda-control__headline">
                    <h3>Agenda da produção</h3>
                    <Badge bg={agendaActive ? "success" : "secondary"}>{agendaActive ? "Ativa" : "Pausada"}</Badge>
                  </div>
                  <p>{agendaActive ? `${activeCount} evento(s) fixo(s) ativo(s) prontos para gerar as próximas edições.` : "A agenda está pausada. Nenhuma ocorrência pode ser gerada até ser reativada."}</p>
                </div>
              </div>
              <div className="cut-agenda-control__actions">
                <Form.Check
                  type="switch"
                  id={`agenda-status-${production?.id}`}
                  checked={agendaActive}
                  disabled={togglingAgenda}
                  onChange={toggleAgenda}
                  label={agendaActive ? "Agenda ligada" : "Agenda desligada"}
                />
                <Button onClick={generateAll} disabled={!agendaActive || activeCount === 0 || generatingAll}>
                  {generatingAll ? <><Spinner size="sm" className="me-2" />Gerando...</> : <><i className="fa-solid fa-wand-magic-sparkles me-2" />Criar próximos eventos</>}
                </Button>
                <Button variant="outline-light" onClick={startCreate}><i className="fa-solid fa-plus me-2" />Adicionar evento fixo</Button>
              </div>
            </section>

            <div className="cut-agenda-help">
              <i className="fa-regular fa-lightbulb" />
              <div><strong>Como funciona</strong><span>A agenda é apenas o modelo semanal. Ao clicar em criar, a Cutinapp calcula a próxima data daquele dia e cria um evento independente em rascunho. Depois você pode editar data, imagem, lineup, ingressos e qualquer outro detalhe normalmente.</span></div>
            </div>

            {formOpen && (
              <Card className="cut-agenda-form-card">
                <Card.Body>
                  <div className="cut-agenda-section-heading">
                    <div><span>{editing ? "Editar modelo semanal" : "Novo modelo semanal"}</span><h3>{editing ? editing.title : "Cadastrar evento fixo"}</h3></div>
                    <Button variant="outline-light" size="sm" onClick={() => { setFormOpen(false); setEditing(null); }} disabled={saving}><i className="fa-solid fa-xmark me-2" />Fechar formulário</Button>
                  </div>

                  <Form onSubmit={save}>
                    <Row className="g-3">
                      <Col xs={12}>
                        <div className="cut-agenda-template-action">
                          <div><strong>Preencher com dados da produção</strong><span>Reaproveita endereço, cidade, contato e informações já cadastradas em {production?.name}.</span></div>
                          <Button type="button" variant="outline-light" onClick={applyProduction}>Usar dados da produção</Button>
                        </div>
                      </Col>

                      <Col md={8}><Form.Group><Form.Label>Nome do evento *</Form.Label><Form.Control name="title" value={form.title} onChange={change} required minLength={2} placeholder="Ex.: Sexta Open Bar" /></Form.Group></Col>
                      <Col md={4}><Form.Group><Form.Label>Categoria</Form.Label><Form.Control name="category" value={form.category} onChange={change} placeholder="Ex.: Festa, show, pagode" /></Form.Group></Col>
                      <Col xs={12}><Form.Group><Form.Label>Descrição *</Form.Label><Form.Control as="textarea" rows={4} name="description" value={form.description} onChange={change} required placeholder="Descrição padrão deste evento semanal" /></Form.Group></Col>

                      <Col md={4}><Form.Group><Form.Label>Dia da semana *</Form.Label><Form.Select name="day_of_week" value={form.day_of_week} onChange={change} required>{DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</Form.Select></Form.Group></Col>
                      <Col md={4}><Form.Group><Form.Label>Horário de início *</Form.Label><Form.Control type="time" name="start_time" value={form.start_time} onChange={change} required /></Form.Group></Col>
                      <Col md={4}><Form.Group><Form.Label>Horário de término *</Form.Label><Form.Control type="time" name="end_time" value={form.end_time} onChange={change} required /><Form.Text>Se terminar depois da meia-noite, use um horário menor que o início.</Form.Text></Form.Group></Col>

                      <Col md={4}><Form.Group><Form.Label>Formato</Form.Label><Form.Select name="event_format" value={form.event_format} onChange={change}><option value="in_person">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></Form.Select></Form.Group></Col>
                      <Col md={4}><Form.Group><Form.Label>Local / espaço</Form.Label><Form.Control name="venue" value={form.venue} onChange={change} placeholder="Nome do local" /></Form.Group></Col>
                      <Col md={4}><Form.Group><Form.Label>Capacidade</Form.Label><Form.Control type="number" min="1" name="max_attendees" value={form.max_attendees} onChange={change} placeholder="Opcional" /></Form.Group></Col>

                      {physical && <>
                        <Col md={8}><Form.Group><Form.Label>Endereço *</Form.Label><Form.Control name="address" value={form.address} onChange={change} required placeholder="Rua, número e complemento" /></Form.Group></Col>
                        <Col md={4}><Form.Group><Form.Label>CEP</Form.Label><Form.Control name="cep" value={form.cep} onChange={change} /></Form.Group></Col>
                        <Col md={6}><Form.Group><Form.Label>Cidade *</Form.Label><Form.Control name="city" value={form.city} onChange={change} required /></Form.Group></Col>
                        <Col md={2}><Form.Group><Form.Label>UF *</Form.Label><Form.Control name="uf" value={form.uf} onChange={change} required maxLength={2} /></Form.Group></Col>
                        <Col md={4}><Form.Group><Form.Label>Google Maps</Form.Label><Form.Control type="url" name="google_maps_url" value={form.google_maps_url} onChange={change} placeholder="https://..." /></Form.Group></Col>
                      </>}

                      {online && <Col xs={12}><Form.Group><Form.Label>Link de acesso online *</Form.Label><Form.Control type="url" name="online_url" value={form.online_url} onChange={change} required placeholder="https://..." /></Form.Group></Col>}

                      <Col md={6}><Form.Group><Form.Label>E-mail de contato</Form.Label><Form.Control type="email" name="contact_email" value={form.contact_email} onChange={change} /></Form.Group></Col>
                      <Col md={6}><Form.Group><Form.Label>Telefone de contato</Form.Label><Form.Control name="contact_phone" value={form.contact_phone} onChange={change} /></Form.Group></Col>
                      <Col md={8}><Form.Group><Form.Label>Imagem padrão</Form.Label><Form.Control type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setForm((current) => ({ ...current, image: e.target.files?.[0] || null }))} /><Form.Text>Até 5 MB. A imagem será copiada para cada ocorrência criada.</Form.Text></Form.Group></Col>
                      <Col md={4} className="d-flex align-items-end"><Form.Check type="switch" id="agenda-private" name="is_private" checked={form.is_private} onChange={change} label="Evento privado por padrão" className="mb-2" /></Col>

                      <Col xs={12} className="cut-agenda-form-actions">
                        <Button type="button" variant="outline-light" onClick={() => { setFormOpen(false); setEditing(null); }} disabled={saving}>Cancelar</Button>
                        <Button type="submit" disabled={saving}>{saving ? <><Spinner size="sm" className="me-2" />Salvando...</> : <><i className="fa-regular fa-floppy-disk me-2" />{editing ? "Salvar alterações" : "Adicionar à agenda"}</>}</Button>
                      </Col>
                    </Row>
                  </Form>
                </Card.Body>
              </Card>
            )}

            <div className="cut-agenda-section-heading cut-agenda-list-heading">
              <div><span>Programação fixa</span><h3>{schedules.length ? `${schedules.length} evento(s) na semana` : "Sua agenda ainda está vazia"}</h3></div>
              {!formOpen && <Button variant="outline-light" size="sm" onClick={startCreate}><i className="fa-solid fa-plus me-2" />Novo evento fixo</Button>}
            </div>

            {schedules.length === 0 ? (
              <div className="cut-agenda-empty">
                <div className="cut-agenda-empty__icon"><i className="fa-regular fa-calendar-plus" /></div>
                <h3>Cadastre a rotina da sua produção</h3>
                <p>Exemplo: toda sexta às 22h e todo sábado às 20h. Depois, basta um clique para preparar as próximas edições.</p>
                <Button onClick={startCreate}>Cadastrar primeiro evento fixo</Button>
              </div>
            ) : (
              <div className="cut-agenda-grid">
                {sortedSchedules.map((schedule) => {
                  const day = dayInfo(schedule.day_of_week);
                  const busy = generatingItemId === schedule.id || togglingItemId === schedule.id || deletingId === schedule.id;
                  return (
                    <Card key={schedule.id} className={`cut-agenda-item ${schedule.is_active ? "is-active" : "is-paused"}`}>
                      {schedule.image && <div className="cut-agenda-item__image" style={{ backgroundImage: `url(${imageUrl(schedule.image)})` }} />}
                      <Card.Body>
                        <div className="cut-agenda-item__top">
                          <div className="cut-agenda-day"><strong>{day.short}</strong><span>{schedule.start_time}</span></div>
                          <Form.Check type="switch" id={`agenda-item-${schedule.id}`} checked={Boolean(schedule.is_active)} disabled={Boolean(togglingItemId)} onChange={() => toggleItem(schedule)} label={schedule.is_active ? "Ativo" : "Pausado"} />
                        </div>
                        <h4>{schedule.title}</h4>
                        <p>{schedule.description}</p>
                        <div className="cut-agenda-item__meta">
                          <span><i className="fa-regular fa-clock" />{schedule.start_time} – {schedule.end_time}</span>
                          {(schedule.venue || schedule.city) && <span><i className="fa-solid fa-location-dot" />{[schedule.venue, schedule.city].filter(Boolean).join(" · ")}</span>}
                          <span><i className="fa-solid fa-repeat" />Toda {day.label.toLowerCase()}</span>
                        </div>
                        <div className="cut-agenda-item__actions">
                          <Button size="sm" onClick={() => generateItem(schedule)} disabled={!agendaActive || !schedule.is_active || busy}>
                            {generatingItemId === schedule.id ? <Spinner size="sm" /> : <i className="fa-solid fa-wand-magic-sparkles" />}<span>Criar próxima edição</span>
                          </Button>
                          <Button size="sm" variant="outline-light" onClick={() => startEdit(schedule)} disabled={busy}><i className="fa-regular fa-pen-to-square" /><span>Editar</span></Button>
                          <Button size="sm" variant="outline-danger" onClick={() => remove(schedule)} disabled={busy} aria-label={`Remover ${schedule.title}`}><i className="fa-regular fa-trash-can" /></Button>
                        </div>
                      </Card.Body>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
}
