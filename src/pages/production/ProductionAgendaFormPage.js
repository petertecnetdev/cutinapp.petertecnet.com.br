import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";
import "./production-agenda.css";

const DAYS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

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

const scheduleToForm = (schedule) => ({
  ...emptyForm(),
  title: schedule?.title || "",
  description: schedule?.description || "",
  category: schedule?.category || "",
  day_of_week: String(schedule?.day_of_week ?? new Date().getDay()),
  start_time: String(schedule?.start_time || "20:00").slice(0, 5),
  end_time: String(schedule?.end_time || "23:00").slice(0, 5),
  venue: schedule?.venue || "",
  address: schedule?.address || "",
  google_maps_url: schedule?.google_maps_url || "",
  city: schedule?.city || "",
  uf: schedule?.uf || "",
  cep: schedule?.cep || "",
  latitude: schedule?.latitude || "",
  longitude: schedule?.longitude || "",
  max_attendees: schedule?.max_attendees || "",
  contact_email: schedule?.contact_email || "",
  contact_phone: schedule?.contact_phone || "",
  is_private: Boolean(schedule?.is_private),
  event_format: schedule?.event_format || "in_person",
  online_url: schedule?.online_url || "",
  image: null,
});

export default function ProductionAgendaFormPage() {
  const { productionId, scheduleId } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(scheduleId);
  const [production, setProduction] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [existingImage, setExistingImage] = useState("");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      cutinappService.productionWorkspace(productionId),
      editing ? eventService.agenda(productionId) : Promise.resolve(null),
    ])
      .then(([workspace, agendaData]) => {
        if (!active) return;
        const productionData = workspace?.organization || workspace?.production || null;
        setProduction(productionData);

        if (editing) {
          const schedule = (Array.isArray(agendaData?.schedules) ? agendaData.schedules : [])
            .find((item) => String(item.id) === String(scheduleId));
          if (!schedule) throw new Error("Este evento fixo não foi encontrado na agenda desta produção.");
          setForm(scheduleToForm(schedule));
          setExistingImage(schedule.image || "");
        } else {
          setForm(emptyForm());
          setExistingImage("");
        }
      })
      .catch((err) => active && setError(apiError(err, "Não foi possível carregar o formulário da agenda.")))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [editing, productionId, scheduleId]);

  const physical = ["in_person", "hybrid"].includes(form.event_format);
  const online = ["online", "hybrid"].includes(form.event_format);
  const dayLabel = useMemo(
    () => DAYS.find((day) => String(day.value) === String(form.day_of_week))?.label || "Dia não definido",
    [form.day_of_week],
  );

  const change = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : name === "uf" ? value.toUpperCase().slice(0, 2) : value,
    }));
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0] || null;
    setForm((current) => ({ ...current, image: file }));
    setPreview(file ? URL.createObjectURL(file) : "");
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

    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (key === "image") return;
        if (typeof value === "boolean") payload.append(key, value ? "1" : "0");
        else payload.append(key, value ?? "");
      });
      if (form.image) payload.append("image", form.image);

      const response = editing
        ? await eventService.updateAgendaItem(scheduleId, payload)
        : await eventService.createAgendaItem(productionId, payload);
      const saved = response?.schedule;
      if (!saved?.id) throw new Error("A API não retornou o item salvo da agenda.");

      navigate(`/production/${productionId}/agenda`, {
        replace: true,
        state: { agendaMessage: response?.message || (editing ? "Evento fixo atualizado." : "Evento fixo adicionado à agenda.") },
      });
    } catch (err) {
      setError(apiError(err, "Não foi possível salvar este evento da agenda."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando formulário" /></div>;
  }

  return (
    <div className="cut-app-page cut-agenda-page cut-agenda-form-page">
      <NavlogComponent />
      {saving && <ProcessingIndicatorComponent label={editing ? "Salvando alterações" : "Adicionando à agenda"} />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading cut-agenda-page__heading">
          <div>
            <span className="cut-eyebrow">{editing ? "Editar evento fixo" : "Novo evento fixo"}</span>
            <h1>{editing ? "Editar programação semanal" : "Cadastrar programação semanal"}</h1>
            <p>{production?.name ? `${production.name} · ` : ""}Preencha o modelo completo deste evento. Depois, cada edição será criada como um evento normal da Cutinapp.</p>
          </div>
          <Button variant="outline-light" disabled={saving} onClick={() => navigate(`/production/${productionId}/agenda`)}>
            <i className="fa-solid fa-arrow-left me-2" />Voltar para agenda
          </Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Form onSubmit={save}>
          <Row className="g-4 align-items-start">
            <Col xl={8}>
              <Card className="cut-agenda-form-card cut-agenda-form-section">
                <Card.Body>
                  <div className="cut-agenda-section-heading">
                    <div><span>Informações principais</span><h3>Dados do evento</h3></div>
                  </div>
                  <Row className="g-3">
                    <Col md={8}><Form.Group><Form.Label>Nome do evento *</Form.Label><Form.Control name="title" value={form.title} onChange={change} required minLength={2} placeholder="Ex.: Sexta Open Bar" /></Form.Group></Col>
                    <Col md={4}><Form.Group><Form.Label>Categoria</Form.Label><Form.Control name="category" value={form.category} onChange={change} placeholder="Ex.: Festa, show, pagode" /></Form.Group></Col>
                    <Col xs={12}><Form.Group><Form.Label>Descrição *</Form.Label><Form.Control as="textarea" rows={5} name="description" value={form.description} onChange={change} required placeholder="Descrição padrão deste evento semanal" /></Form.Group></Col>
                  </Row>
                </Card.Body>
              </Card>

              <Card className="cut-agenda-form-card cut-agenda-form-section">
                <Card.Body>
                  <div className="cut-agenda-section-heading">
                    <div><span>Recorrência</span><h3>Dia e horário</h3></div>
                  </div>
                  <Row className="g-3">
                    <Col md={4}><Form.Group><Form.Label>Dia da semana *</Form.Label><Form.Select name="day_of_week" value={form.day_of_week} onChange={change} required>{DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</Form.Select></Form.Group></Col>
                    <Col md={4}><Form.Group><Form.Label>Horário de início *</Form.Label><Form.Control type="time" name="start_time" value={form.start_time} onChange={change} required /></Form.Group></Col>
                    <Col md={4}><Form.Group><Form.Label>Horário de término *</Form.Label><Form.Control type="time" name="end_time" value={form.end_time} onChange={change} required /><Form.Text>Se terminar depois da meia-noite, use um horário menor que o início.</Form.Text></Form.Group></Col>
                  </Row>
                </Card.Body>
              </Card>

              <Card className="cut-agenda-form-card cut-agenda-form-section">
                <Card.Body>
                  <div className="cut-agenda-section-heading">
                    <div><span>Local e acesso</span><h3>Onde o evento acontece</h3></div>
                  </div>

                  <div className="cut-agenda-template-action mb-4">
                    <div><strong>Usar dados da produção</strong><span>Preenche endereço, cidade, contato e capacidade já cadastrados em {production?.name || "esta produção"}.</span></div>
                    <Button type="button" variant="outline-light" onClick={applyProduction}>Preencher automaticamente</Button>
                  </div>

                  <Row className="g-3">
                    <Col md={4}><Form.Group><Form.Label>Formato</Form.Label><Form.Select name="event_format" value={form.event_format} onChange={change}><option value="in_person">Presencial</option><option value="online">Online</option><option value="hybrid">Híbrido</option></Form.Select></Form.Group></Col>
                    <Col md={5}><Form.Group><Form.Label>Local / espaço</Form.Label><Form.Control name="venue" value={form.venue} onChange={change} placeholder="Nome do local" /></Form.Group></Col>
                    <Col md={3}><Form.Group><Form.Label>Capacidade</Form.Label><Form.Control type="number" min="1" name="max_attendees" value={form.max_attendees} onChange={change} placeholder="Opcional" /></Form.Group></Col>

                    {physical && <>
                      <Col md={8}><Form.Group><Form.Label>Endereço *</Form.Label><Form.Control name="address" value={form.address} onChange={change} required placeholder="Rua, número e complemento" /></Form.Group></Col>
                      <Col md={4}><Form.Group><Form.Label>CEP</Form.Label><Form.Control name="cep" value={form.cep} onChange={change} /></Form.Group></Col>
                      <Col md={6}><Form.Group><Form.Label>Cidade *</Form.Label><Form.Control name="city" value={form.city} onChange={change} required /></Form.Group></Col>
                      <Col md={2}><Form.Group><Form.Label>UF *</Form.Label><Form.Control name="uf" value={form.uf} onChange={change} required maxLength={2} /></Form.Group></Col>
                      <Col md={4}><Form.Group><Form.Label>Google Maps</Form.Label><Form.Control type="url" name="google_maps_url" value={form.google_maps_url} onChange={change} placeholder="https://..." /></Form.Group></Col>
                    </>}

                    {online && <Col xs={12}><Form.Group><Form.Label>Link de acesso online *</Form.Label><Form.Control type="url" name="online_url" value={form.online_url} onChange={change} required placeholder="https://..." /></Form.Group></Col>}
                  </Row>
                </Card.Body>
              </Card>

              <Card className="cut-agenda-form-card cut-agenda-form-section">
                <Card.Body>
                  <div className="cut-agenda-section-heading">
                    <div><span>Contato e mídia</span><h3>Divulgação padrão</h3></div>
                  </div>
                  <Row className="g-3">
                    <Col md={6}><Form.Group><Form.Label>E-mail de contato</Form.Label><Form.Control type="email" name="contact_email" value={form.contact_email} onChange={change} /></Form.Group></Col>
                    <Col md={6}><Form.Group><Form.Label>Telefone de contato</Form.Label><Form.Control name="contact_phone" value={form.contact_phone} onChange={change} /></Form.Group></Col>
                    <Col xs={12}><Form.Group><Form.Label>Imagem padrão</Form.Label><Form.Control type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} /><Form.Text>Até 5 MB. A imagem será copiada para cada ocorrência criada.</Form.Text></Form.Group></Col>
                    {(preview || existingImage) && <Col xs={12}><img className="cut-agenda-form-image-preview" src={preview || imageUrl(existingImage)} alt="Prévia do evento" /></Col>}
                    <Col xs={12}><Form.Check type="switch" id="agenda-private" name="is_private" checked={form.is_private} onChange={change} label="Evento privado por padrão" /></Col>
                  </Row>
                </Card.Body>
              </Card>
            </Col>

            <Col xl={4}>
              <div className="cut-agenda-form-sidebar">
                <Card className="cut-agenda-form-card cut-agenda-form-summary">
                  <Card.Body>
                    <span className="cut-eyebrow">Resumo da agenda</span>
                    <h3>{form.title || "Novo evento fixo"}</h3>
                    <div className="cut-agenda-form-summary__row"><i className="fa-solid fa-repeat" /><span>{dayLabel}</span></div>
                    <div className="cut-agenda-form-summary__row"><i className="fa-regular fa-clock" /><span>{form.start_time || "--:--"} – {form.end_time || "--:--"}</span></div>
                    {(form.venue || form.city) && <div className="cut-agenda-form-summary__row"><i className="fa-solid fa-location-dot" /><span>{[form.venue, form.city].filter(Boolean).join(" · ")}</span></div>}
                    <div className="cut-agenda-form-summary__row"><i className="fa-solid fa-eye" /><span>{form.is_private ? "Privado" : "Público"}</span></div>
                    <p>Ao gerar a próxima edição, esse modelo cria um evento normal em rascunho. Alterações específicas daquela data não mudam a agenda semanal.</p>
                    <Button type="submit" className="w-100" disabled={saving}>
                      {saving ? <><Spinner size="sm" className="me-2" />Salvando...</> : <><i className="fa-regular fa-floppy-disk me-2" />{editing ? "Salvar alterações" : "Adicionar à agenda"}</>}
                    </Button>
                    <Button type="button" variant="outline-light" className="w-100 mt-2" disabled={saving} onClick={() => navigate(`/production/${productionId}/agenda`)}>Cancelar</Button>
                  </Card.Body>
                </Card>
              </div>
            </Col>
          </Row>
        </Form>
      </Container>
    </div>
  );
}
