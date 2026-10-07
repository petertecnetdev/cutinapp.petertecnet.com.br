import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import CityAutocompleteControl from "../../components/location/CityAutocompleteControl";
import communityMeetupService from "../../services/CommunityMeetupService";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";
import "./CommunityMeetupEditorPage.css";

const pad = (value) => String(value).padStart(2, "0");
const localInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const initialStart = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return localInput(date);
};
const addHours = (value, hours = 2) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setHours(date.getHours() + hours);
  return localInput(date);
};
const initialForm = () => {
  const start = initialStart();
  return {
    title: "",
    description: "",
    category: "",
    venue: "",
    address: "",
    city: "",
    uf: "",
    start_date: start,
    end_date: addHours(start),
    max_attendees: "",
    attendance_radius_m: "250",
    show_attendees: true,
    latitude: "",
    longitude: "",
    image: null,
  };
};
const imageUrl = (value) => {
  if (!value) return "";
  if (/^(https?:|blob:|data:)/i.test(value)) return value;
  return `${storageUrl}${String(value).replace(/^\//, "")}`;
};

export default function CommunityMeetupEditorPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [existingImage, setExistingImage] = useState("");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!editing) return undefined;
    let active = true;
    setLoading(true);
    eventService.show(id)
      .then((event) => {
        if (!active) return;
        if (event?.kind !== "community") throw new Error("Este registro não é um encontro comunitário.");
        setForm({
          title: event.title || "",
          description: event.description || "",
          category: event.category || "",
          venue: event.venue || "",
          address: event.address || "",
          city: event.city || "",
          uf: event.uf || "",
          start_date: localInput(event.start_date),
          end_date: localInput(event.end_date),
          max_attendees: event.max_attendees || "",
          attendance_radius_m: event.attendance_radius_m || "250",
          show_attendees: event.show_attendees !== false,
          latitude: event.latitude || "",
          longitude: event.longitude || "",
          image: null,
        });
        setExistingImage(event.image || "");
      })
      .catch((err) => setError(err?.message || "Não foi possível carregar o encontro."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [editing, id]);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const cover = useMemo(() => preview || imageUrl(existingImage), [preview, existingImage]);

  const change = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  };

  const chooseImage = (event) => {
    const file = event.target.files?.[0] || null;
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setForm((current) => ({ ...current, image: file }));
    setPreview(file ? URL.createObjectURL(file) : "");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Este navegador não oferece geolocalização.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setForm((current) => ({
          ...current,
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
        }));
        setLocating(false);
      },
      () => {
        setError("Não foi possível obter sua localização. Você ainda pode criar o encontro e usar confirmação manual de presença.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    if (new Date(form.end_date) <= new Date(form.start_date)) {
      setFieldErrors({ end_date: ["O término precisa ser posterior ao início."] });
      return;
    }

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append("kind", "community");
      payload.append("event_format", "in_person");
      payload.append("is_private", "0");
      payload.append("title", form.title.trim());
      payload.append("description", form.description.trim());
      payload.append("venue", form.venue.trim());
      payload.append("address", form.address.trim());
      payload.append("city", form.city.trim());
      payload.append("uf", form.uf.trim());
      payload.append("start_date", form.start_date);
      payload.append("end_date", form.end_date);
      payload.append("show_attendees", form.show_attendees ? "1" : "0");
      payload.append("attendance_radius_m", String(form.attendance_radius_m || 250));
      if (form.category.trim()) payload.append("category", form.category.trim());
      if (form.max_attendees) payload.append("max_attendees", String(form.max_attendees));
      if (form.latitude && form.longitude) {
        payload.append("latitude", String(form.latitude));
        payload.append("longitude", String(form.longitude));
      }
      if (form.image) payload.append("image", form.image);

      const saved = editing
        ? await communityMeetupService.update(id, payload)
        : await communityMeetupService.create(payload);

      const slug = saved?.slug;
      if (!slug) throw new Error("O encontro foi salvo, mas a API não retornou o endereço público.");
      navigate(`/event/${slug}`, { replace: true });
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível salvar o encontro.");
    } finally {
      setSaving(false);
    }
  };

  const fieldError = (name) => {
    const value = fieldErrors?.[name];
    return Array.isArray(value) ? value[0] : value || "";
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || saving) && <ProcessingIndicatorComponent label={loading ? "Carregando encontro" : "Salvando encontro"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-meetup-editor__header">
          <div>
            <span className="cut-eyebrow">Encontros</span>
            <h1>{editing ? "Editar encontro" : "Reúna pessoas de verdade"}</h1>
            <p>{editing ? "Atualize o combinado e mantenha os participantes informados." : "Crie um encontro comunitário gratuito. Não há ingressos, checkout ou cobrança."}</p>
          </div>
          <span className="cut-meetup-editor__free"><i className="fa-solid fa-people-group" /> Comunitário · grátis</span>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Form onSubmit={save}>
          <Row className="g-4">
            <Col lg={8}>
              <Card className="cut-panel"><Card.Body className="p-4 p-lg-5">
                <span className="cut-eyebrow">O combinado</span>
                <h2 className="cut-section-title mt-2">O que a galera vai fazer?</h2>

                <Form.Group className="mt-4">
                  <Form.Label>Nome do encontro *</Form.Label>
                  <Form.Control name="title" value={form.title} onChange={change} minLength={2} maxLength={255} required placeholder="Ex.: Devs no parque — café e conversa" isInvalid={Boolean(fieldError("title"))} />
                  <Form.Control.Feedback type="invalid">{fieldError("title")}</Form.Control.Feedback>
                </Form.Group>

                <Form.Group className="mt-3">
                  <Form.Label>Descrição *</Form.Label>
                  <Form.Control as="textarea" rows={6} name="description" value={form.description} onChange={change} required maxLength={50000} placeholder="Explique a ideia, para quem é o encontro e como encontrar o grupo." isInvalid={Boolean(fieldError("description"))} />
                  <Form.Control.Feedback type="invalid">{fieldError("description")}</Form.Control.Feedback>
                </Form.Group>

                <Row className="g-3 mt-1">
                  <Col md={6}><Form.Group><Form.Label>Interesse / categoria</Form.Label><Form.Control name="category" value={form.category} onChange={change} placeholder="Tecnologia, música, corrida..." /></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Ponto de encontro *</Form.Label><Form.Control name="venue" value={form.venue} onChange={change} required placeholder="Ex.: entrada principal do parque" /></Form.Group></Col>
                </Row>
              </Card.Body></Card>

              <Card className="cut-panel mt-4"><Card.Body className="p-4 p-lg-5">
                <span className="cut-eyebrow">Quando e onde</span>
                <h2 className="cut-section-title mt-2">Facilite para todo mundo chegar</h2>

                <Row className="g-3 mt-1">
                  <Col md={6}><Form.Group><Form.Label>Começa *</Form.Label><Form.Control type="datetime-local" name="start_date" value={form.start_date} onChange={change} required isInvalid={Boolean(fieldError("start_date"))} /><Form.Control.Feedback type="invalid">{fieldError("start_date")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Termina *</Form.Label><Form.Control type="datetime-local" name="end_date" value={form.end_date} onChange={change} required isInvalid={Boolean(fieldError("end_date"))} /><Form.Control.Feedback type="invalid">{fieldError("end_date")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={7}><Form.Group><Form.Label>Endereço *</Form.Label><Form.Control name="address" value={form.address} onChange={change} required placeholder="Rua, número ou referência" isInvalid={Boolean(fieldError("address"))} /><Form.Control.Feedback type="invalid">{fieldError("address")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={5}><Form.Group><Form.Label>Cidade *</Form.Label><CityAutocompleteControl value={form.city} required isInvalid={Boolean(fieldError("city"))} onChange={({ city, uf }) => setForm((current) => ({ ...current, city, uf }))} /><Form.Text>{form.uf ? `UF: ${form.uf}` : "Selecione uma cidade da lista."}</Form.Text></Form.Group></Col>
                </Row>

                <div className="cut-meetup-location mt-4">
                  <div><strong>Check-in por localização</strong><span>Defina as coordenadas do ponto de encontro para a pessoa confirmar presença sozinha quando estiver no local. A Cutinapp não precisa acompanhar a localização continuamente.</span></div>
                  <Button type="button" variant="outline-light" onClick={useCurrentLocation} disabled={locating}><i className="fa-solid fa-location-crosshairs me-2" />{locating ? "Localizando..." : form.latitude ? "Atualizar ponto" : "Usar minha localização"}</Button>
                </div>
                {form.latitude && form.longitude && <small className="d-block text-secondary mt-2">Ponto de check-in configurado · raio de {form.attendance_radius_m || 250} m.</small>}
              </Card.Body></Card>
            </Col>

            <Col lg={4}>
              <Card className="cut-panel"><Card.Body className="p-4">
                <span className="cut-eyebrow">Imagem</span>
                <h2 className="h5 mt-2">Dê uma cara ao encontro</h2>
                <p className="text-secondary small">A imagem também será usada na prévia do link compartilhado.</p>
                <div className="cut-meetup-cover">{cover ? <img src={cover} alt="" /> : <div><i className="fa-regular fa-image" /><span>Adicione uma imagem</span></div>}</div>
                <Form.Control className="mt-3" type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
              </Card.Body></Card>

              <Card className="cut-panel mt-4"><Card.Body className="p-4">
                <span className="cut-eyebrow">Participação</span>
                <Form.Group className="mt-3"><Form.Label>Limite de pessoas</Form.Label><Form.Control type="number" min="1" max="1000000" name="max_attendees" value={form.max_attendees} onChange={change} placeholder="Sem limite" /></Form.Group>
                <Form.Group className="mt-3"><Form.Label>Raio do check-in</Form.Label><Form.Select name="attendance_radius_m" value={form.attendance_radius_m} onChange={change}><option value="100">100 m</option><option value="250">250 m</option><option value="500">500 m</option><option value="1000">1 km</option></Form.Select></Form.Group>
                <Form.Check className="mt-3" type="switch" id="show-attendees" name="show_attendees" checked={form.show_attendees} onChange={change} label="Mostrar quem confirmou presença" />
              </Card.Body></Card>

              <div className="d-grid gap-2 mt-4">
                <Button type="submit" size="lg" disabled={saving}>{saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar e publicar encontro"}</Button>
                <Button type="button" variant="outline-light" onClick={() => navigate(-1)} disabled={saving}>Cancelar</Button>
              </div>
            </Col>
          </Row>
        </Form>
      </Container>
    </div>
  );
}
