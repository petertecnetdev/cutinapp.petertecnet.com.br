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
  google_maps_url: "",
  city: "",
  uf: "",
  venue: "",
  start_date: "",
  end_date: "",
  max_attendees: "",
  contact_email: "",
  contact_phone: "",
  image: null,
};

const firstError = (errors, field) => {
  const value = errors?.[field];
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
};

const pad = (value) => String(value).padStart(2, "0");
const toLocalInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const minStartValue = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 5);
  date.setSeconds(0, 0);
  return toLocalInput(date);
};
const addHours = (value, hours = 2) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(date.getHours() + hours);
  return toLocalInput(date);
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
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const minStart = useMemo(() => minStartValue(), []);

  useEffect(() => {
    let active = true;
    const selectedProduction = new URLSearchParams(location.search).get("productionId") || "";

    cutinappService.myProductions()
      .then((items) => {
        if (!active) return;
        setProductions(items);
        const requested = items.some((item) => String(item.id) === selectedProduction) ? selectedProduction : "";
        const fallback = requested || (items.length === 1 ? String(items[0].id) : "");
        setForm((current) => ({ ...current, production_id: fallback }));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas produções."))
      .finally(() => active && setLoadingProductions(false));

    return () => { active = false; };
  }, [location.search]);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const startDate = form.start_date ? new Date(form.start_date) : null;
  const endDate = form.end_date ? new Date(form.end_date) : null;
  const now = new Date();
  const startPastInvalid = submitted && startDate && startDate.getTime() < now.getTime();
  const dateInvalid = submitted && startDate && endDate && endDate.getTime() <= startDate.getTime();
  const ufInvalid = submitted && form.uf.trim().length !== 2;
  const capacityInvalid = submitted && form.max_attendees !== "" && Number(form.max_attendees) < 1;

  const requiredInvalid = submitted && {
    production_id: !form.production_id,
    title: form.title.trim().length < 2,
    description: !form.description.trim(),
    address: !form.address.trim(),
    city: !form.city.trim(),
    uf: !form.uf.trim(),
    start_date: !form.start_date || startPastInvalid,
    end_date: !form.end_date || dateInvalid,
  };

  const canSubmit = useMemo(() => Boolean(
    form.production_id &&
    form.title.trim().length >= 2 &&
    form.description.trim() &&
    form.address.trim() &&
    form.city.trim() &&
    form.uf.trim().length === 2 &&
    form.start_date &&
    form.end_date
  ) && !loading, [form, loading]);

  const change = (event) => {
    const { name, value } = event.target;
    const normalized = name === "uf" ? value.toUpperCase().slice(0, 2) : value;

    setForm((current) => {
      const next = { ...current, [name]: normalized };
      if (name === "start_date" && normalized) {
        const suggestedEnd = addHours(normalized, 2);
        if (!current.end_date || new Date(current.end_date) <= new Date(normalized)) {
          next.end_date = suggestedEnd;
        }
      }
      return next;
    });

    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0] || null;
    if (file && file.size > 5 * 1024 * 1024) {
      setFieldErrors((current) => ({ ...current, image: ["A imagem do evento deve ter no máximo 5 MB."] }));
      return;
    }
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setForm((current) => ({ ...current, image: file }));
    setPreview(file ? URL.createObjectURL(file) : "");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setFieldErrors({});

    if (!canSubmit || dateInvalid || startPastInvalid || ufInvalid || capacityInvalid) {
      if (startPastInvalid) setError("O início do evento não pode ficar no passado.");
      else if (dateInvalid) setError("O término do evento precisa ser posterior ao início.");
      else setError("Revise os campos destacados antes de continuar.");
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && String(value).trim() !== "") payload.append(key, value);
      });

      const response = await eventService.store(payload);
      const eventId = Number(response?.event?.id || 0);
      if (!eventId) throw new Error("A API informou sucesso, mas não retornou o evento criado.");
      if (response?.event?.is_published !== false) throw new Error("O evento deveria ter sido criado como rascunho, mas a API retornou outro estado.");
      navigate(`/ticket/create?eventId=${eventId}`, { replace: true });
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível criar o evento.");
    } finally {
      setLoading(false);
    }
  };

  const invalid = (field, local = false) => Boolean(local || firstError(fieldErrors, field));

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || loadingProductions) && <ProcessingIndicatorComponent label={loading ? "Criando evento" : "Carregando produções"} />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading"><div><span className="cut-eyebrow">Área do produtor</span><h1>Novo evento</h1><p>O evento nasce como rascunho. Configure os dados, depois as cortesias e só então publique.</p></div></div>
        {error && <Alert variant="danger">{error}</Alert>}

        {!loadingProductions && productions.length === 0 ? (
          <Card className="cut-empty-state"><Card.Body><h2>Primeiro crie uma produção</h2><p>Todo evento precisa pertencer a uma produção Cutinapp sob sua responsabilidade.</p><Button onClick={() => navigate("/production/create")}>Criar produção</Button></Card.Body></Card>
        ) : (
          <Form onSubmit={submit} noValidate>
            <Row className="g-4">
              <Col lg={8}><Card className="cut-panel h-100"><Card.Body className="p-4 p-lg-5"><h2 className="cut-section-title">Informações do evento</h2><Row className="g-3">
                <Col xs={12}><Form.Group><Form.Label>Produção *</Form.Label><Form.Select name="production_id" value={form.production_id} onChange={change} isInvalid={invalid("production_id", requiredInvalid.production_id)}><option value="">Selecione</option>{productions.map((production) => <option key={production.id} value={production.id}>{production.name}</option>)}</Form.Select><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "production_id") || "Selecione a produção responsável."}</Form.Control.Feedback></Form.Group></Col>
                <Col xs={12}><Form.Group><Form.Label>Nome do evento *</Form.Label><Form.Control name="title" value={form.title} onChange={change} placeholder="Ex.: Noite de Lançamento" isInvalid={invalid("title", requiredInvalid.title)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "title") || "Informe o nome do evento."}</Form.Control.Feedback></Form.Group></Col>
                <Col xs={12}><Form.Group><Form.Label>Descrição *</Form.Label><Form.Control as="textarea" rows={5} name="description" value={form.description} onChange={change} isInvalid={invalid("description", requiredInvalid.description)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "description") || "Descreva o evento."}</Form.Control.Feedback></Form.Group></Col>
                <Col md={6}><Form.Group><Form.Label>Início *</Form.Label><Form.Control type="datetime-local" min={minStart} name="start_date" value={form.start_date} onChange={change} isInvalid={invalid("start_date", requiredInvalid.start_date)} /><Form.Text>Horário de Brasília.</Form.Text><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "start_date") || (startPastInvalid ? "O início não pode ficar no passado." : "Informe quando o evento começa.")}</Form.Control.Feedback></Form.Group></Col>
                <Col md={6}><Form.Group><Form.Label>Término *</Form.Label><Form.Control type="datetime-local" min={form.start_date || minStart} name="end_date" value={form.end_date} onChange={change} isInvalid={invalid("end_date", requiredInvalid.end_date)} /><Form.Text>Precisa ser posterior ao início.</Form.Text><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "end_date") || (dateInvalid ? "O término precisa ser posterior ao início." : "Informe quando o evento termina.")}</Form.Control.Feedback></Form.Group></Col>
                <Col md={5}><Form.Group><Form.Label>Local</Form.Label><Form.Control name="venue" value={form.venue} onChange={change} placeholder="Nome do espaço" isInvalid={invalid("venue")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "venue")}</Form.Control.Feedback></Form.Group></Col>
                <Col md={7}><Form.Group><Form.Label>Endereço *</Form.Label><Form.Control name="address" value={form.address} onChange={change} placeholder="Rua, número e complemento" isInvalid={invalid("address", requiredInvalid.address)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "address") || "Informe o endereço do evento."}</Form.Control.Feedback></Form.Group></Col>
                <Col xs={12}><Form.Group><Form.Label>Link do Google Maps</Form.Label><Form.Control type="url" name="google_maps_url" value={form.google_maps_url} onChange={change} placeholder="https://maps.app.goo.gl/... ou https://www.google.com/maps/..." isInvalid={invalid("google_maps_url")} /><Form.Text>Cole o link do local no Google Maps. Ele será usado na página pública para ajudar o participante a chegar ao evento.</Form.Text><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "google_maps_url")}</Form.Control.Feedback></Form.Group></Col>
                <Col md={8}><Form.Group><Form.Label>Cidade *</Form.Label><Form.Control name="city" value={form.city} onChange={change} isInvalid={invalid("city", requiredInvalid.city)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "city") || "Informe a cidade do evento."}</Form.Control.Feedback></Form.Group></Col>
                <Col md={4}><Form.Group><Form.Label>UF *</Form.Label><Form.Control maxLength={2} name="uf" value={form.uf} onChange={change} isInvalid={invalid("uf", requiredInvalid.uf || ufInvalid)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "uf") || "Use 2 letras."}</Form.Control.Feedback></Form.Group></Col>
                <Col md={6}><Form.Group><Form.Label>Capacidade</Form.Label><Form.Control type="number" min="1" max="1000000" name="max_attendees" value={form.max_attendees} onChange={change} isInvalid={invalid("max_attendees", capacityInvalid)} /><Form.Text>Deixe vazio se não quiser controlar capacidade geral.</Form.Text><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "max_attendees") || "A capacidade deve ser maior que zero."}</Form.Control.Feedback></Form.Group></Col>
                <Col md={6}><Form.Group><Form.Label>E-mail de contato</Form.Label><Form.Control type="email" name="contact_email" value={form.contact_email} onChange={change} isInvalid={invalid("contact_email")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "contact_email")}</Form.Control.Feedback></Form.Group></Col>
                <Col md={6}><Form.Group><Form.Label>Telefone de contato</Form.Label><Form.Control name="contact_phone" value={form.contact_phone} onChange={change} isInvalid={invalid("contact_phone")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "contact_phone")}</Form.Control.Feedback></Form.Group></Col>
              </Row></Card.Body></Card></Col>

              <Col lg={4}><Card className="cut-panel h-100"><Card.Body className="p-4"><h2 className="cut-section-title">Imagem do evento</h2>{preview ? <img src={preview} alt="Prévia do evento" className="cut-upload-preview cut-upload-preview--event" /> : <div className="cut-upload-placeholder"><i className="fa-regular fa-image" /><span>Adicione uma capa 16:9</span></div>}<Form.Control className="mt-3" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} isInvalid={invalid("image")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "image")}</Form.Control.Feedback><Form.Text>JPG, PNG ou WebP, até 5 MB.</Form.Text><div className="cut-info-box mt-4"><strong>Próxima etapa</strong><span>Depois de salvar, você configura a quantidade de cortesias. A publicação será uma ação separada.</span></div></Card.Body></Card></Col>
            </Row>

            <div className="cut-form-actions mt-4"><Button type="button" variant="outline-light" disabled={loading} onClick={() => navigate("/event/manage")}>Cancelar</Button><Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar rascunho e configurar cortesia"}</Button></div>
          </Form>
        )}
      </Container>
    </div>
  );
}
