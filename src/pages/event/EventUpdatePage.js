import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import commerceService from "../../services/CommerceService";
import { storageUrl } from "../../config";

const pad = (number) => String(number).padStart(2, "0");
const toLocalInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const minNow = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 1);
  return toLocalInput(date);
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
  const [fieldErrors, setFieldErrors] = useState({});
  const [eventItems, setEventItems] = useState([]);
  const [itemForm, setItemForm] = useState({ name: "", description: "", price: "", quantity: "" });
  const [itemLoading, setItemLoading] = useState(false);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemBusyId, setItemBusyId] = useState(null);
  const [success, setSuccess] = useState(
    new URLSearchParams(location.search).get("courtesyCreated") === "1"
      ? "Cortesia criada. Revise o evento e publique quando estiver pronto."
      : ""
  );

  const applyEvent = (item) => {
    setEventData(item);
    setForm({
      production_id: item.production_id,
      title: item.title || "",
      description: item.description || "",
      venue: item.venue || "",
      address: item.address || "",
      google_maps_url: item.google_maps_url || "",
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

  const loadEvent = async () => applyEvent(await eventService.show(id));
  const loadEventItems = async () => {
    if (!eventData?.is_published || !eventData?.slug) return;
    setItemLoading(true);
    try {
      const catalog = await commerceService.catalog(eventData.slug);
      setEventItems(Array.isArray(catalog?.items) ? catalog.items : []);
    } catch (err) {
      setError(err?.message || "Não foi possível carregar os adicionais deste evento.");
    } finally {
      setItemLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    eventService.show(id)
      .then((item) => active && applyEvent(item))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar o evento."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (eventData?.is_published && eventData?.slug) loadEventItems();
  }, [eventData?.is_published, eventData?.slug]);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const dateInvalid = Boolean(form?.start_date && form?.end_date && new Date(form.end_date) <= new Date(form.start_date));
  const capacityInvalid = Boolean(form?.max_attendees !== "" && Number(form?.max_attendees) < 1);
  const ufInvalid = Boolean(form?.uf && form.uf.trim().length !== 2);

  const canSave = useMemo(() => Boolean(
    form && form.title.trim().length >= 2 && form.description.trim() && form.address.trim() &&
    form.start_date && form.end_date && !dateInvalid && !capacityInvalid && !ufInvalid && !saving
  ), [form, dateInvalid, capacityInvalid, ufInvalid, saving]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === "uf" ? value.toUpperCase().slice(0, 2) : value }));
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
    setImage(file);
    if (file) setPreview(URL.createObjectURL(file));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setFieldErrors({});
    if (!canSave) {
      setError(dateInvalid ? "O término do evento precisa ser posterior ao início." : "Revise os campos destacados antes de salvar.");
      return;
    }

    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && value !== "") data.append(key, value);
      });
      if (image) data.append("image", image);
      const response = await eventService.update(id, data);
      applyEvent(response.event);
      setSuccess("Alterações salvas com sucesso.");
    } catch (err) {
      setFieldErrors(err?.errors || {});
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
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível alterar a publicação do evento.");
    } finally {
      setPublishing(false);
    }
  };

  const saveAddOn = async () => {
    const price = Number(itemForm.price);
    const quantity = Number(itemForm.quantity);
    if (!itemForm.name.trim() || !Number.isFinite(price) || price < 0.01 || !Number.isInteger(quantity) || quantity < 0) {
      setError("Informe nome, preço válido e estoque inteiro para o adicional.");
      return;
    }
    setItemSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await commerceService.saveEventItem(id, {
        name: itemForm.name.trim(),
        description: itemForm.description.trim() || null,
        price,
        quantity,
        is_active: true,
      });
      setItemForm({ name: "", description: "", price: "", quantity: "" });
      if (eventData?.is_published && eventData?.slug) await loadEventItems();
      else if (response?.item) setEventItems((current) => [...current.filter((item) => item.id !== response.item.id), response.item]);
      setSuccess("Adicional disponível para venda neste evento.");
      try {
        window.PeterTecnetTelemetry?.track?.("producer_event_addon_created", {
          label: "Adicional criado no evento",
          target: String(id),
          metadata: { event_id: Number(id), price, quantity, gross_potential: Number((price * quantity).toFixed(2)) },
        });
      } catch (_) { /* Telemetria nunca bloqueia monetização. */ }
    } catch (err) {
      setError(err?.message || "Não foi possível salvar o adicional.");
    } finally {
      setItemSaving(false);
    }
  };

  const removeAddOn = async (item) => {
    setItemBusyId(item.id);
    setError("");
    setSuccess("");
    try {
      await commerceService.deleteEventItem(id, item.id);
      setEventItems((current) => current.filter((entry) => entry.id !== item.id));
      if (eventData?.is_published && eventData?.slug) await loadEventItems();
      setSuccess("Adicional removido das novas vendas.");
    } catch (err) {
      setError(err?.message || "Não foi possível remover o adicional.");
    } finally {
      setItemBusyId(null);
    }
  };

  const fieldError = (field) => {
    const value = fieldErrors?.[field];
    return Array.isArray(value) ? value[0] : value || "";
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando evento" /></div>;

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(saving || publishing) && <ProcessingIndicatorComponent label={publishing ? "Atualizando publicação" : "Salvando evento"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading"><div><span className="cut-eyebrow">Gestão do evento</span><h1>Editar evento</h1><p>Revise agenda, localização, mapa, cortesias e publicação antes de colocar o evento no ar.</p></div><div className="cut-card-actions"><Button variant="outline-light" onClick={() => navigate("/event/manage")}>Voltar</Button>{eventData?.is_published && eventData?.slug && <Button variant="outline-light" onClick={() => navigate(`/event/${eventData.slug}`)}>Página pública</Button>}</div></div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {form && <Form onSubmit={submit} noValidate>
          <Row className="g-4">
            <Col lg={8}><Card className="cut-panel"><Card.Body className="p-4 p-lg-5"><span className="cut-eyebrow">Apresentação</span><h2 className="cut-section-title mt-2">Informações principais</h2><Row className="g-3">
              <Col xs={12}><Form.Group><Form.Label>Nome do evento *</Form.Label><Form.Control name="title" value={form.title} onChange={change} isInvalid={Boolean(fieldError("title"))} /><Form.Control.Feedback type="invalid">{fieldError("title")}</Form.Control.Feedback></Form.Group></Col>
              <Col xs={12}><Form.Group><Form.Label>Descrição *</Form.Label><Form.Control as="textarea" rows={7} name="description" value={form.description} onChange={change} isInvalid={Boolean(fieldError("description"))} /><Form.Control.Feedback type="invalid">{fieldError("description")}</Form.Control.Feedback></Form.Group></Col>
              <Col xs={12}><Form.Group><Form.Label>Imagem/capa</Form.Label>{preview && <img src={preview} className="cut-upload-preview cut-upload-preview--event" alt="Prévia" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} isInvalid={Boolean(fieldError("image"))} /><Form.Control.Feedback type="invalid">{fieldError("image")}</Form.Control.Feedback></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>E-mail de contato</Form.Label><Form.Control type="email" name="contact_email" value={form.contact_email} onChange={change} isInvalid={Boolean(fieldError("contact_email"))} /><Form.Control.Feedback type="invalid">{fieldError("contact_email")}</Form.Control.Feedback></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Telefone de contato</Form.Label><Form.Control name="contact_phone" value={form.contact_phone} onChange={change} /></Form.Group></Col>
            </Row></Card.Body></Card></Col>

            <Col lg={4}><Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Agenda e local</span><div className="d-grid gap-3 mt-3">
              <Form.Group><Form.Label>Início *</Form.Label><Form.Control type="datetime-local" min={!eventData?.is_published ? minNow() : undefined} name="start_date" value={form.start_date} onChange={change} isInvalid={Boolean(fieldError("start_date"))} /><Form.Text>Horário de Brasília.</Form.Text><Form.Control.Feedback type="invalid">{fieldError("start_date")}</Form.Control.Feedback></Form.Group>
              <Form.Group><Form.Label>Término *</Form.Label><Form.Control type="datetime-local" min={form.start_date || undefined} name="end_date" value={form.end_date} onChange={change} isInvalid={dateInvalid || Boolean(fieldError("end_date"))} /><Form.Control.Feedback type="invalid">{fieldError("end_date") || "O término precisa ser posterior ao início."}</Form.Control.Feedback></Form.Group>
              <Form.Group><Form.Label>Local</Form.Label><Form.Control name="venue" value={form.venue} onChange={change} /></Form.Group>
              <Form.Group><Form.Label>Endereço *</Form.Label><Form.Control name="address" value={form.address} onChange={change} isInvalid={Boolean(fieldError("address"))} /><Form.Control.Feedback type="invalid">{fieldError("address")}</Form.Control.Feedback></Form.Group>
              <Form.Group><Form.Label>Link do Google Maps</Form.Label><Form.Control type="url" name="google_maps_url" value={form.google_maps_url} onChange={change} placeholder="https://maps.app.goo.gl/..." isInvalid={Boolean(fieldError("google_maps_url"))} /><Form.Text>Cole o link compartilhável do local.</Form.Text><Form.Control.Feedback type="invalid">{fieldError("google_maps_url")}</Form.Control.Feedback></Form.Group>
              <Row className="g-2"><Col xs={8}><Form.Control name="city" placeholder="Cidade" value={form.city} onChange={change} /></Col><Col xs={4}><Form.Control name="uf" maxLength={2} placeholder="UF" value={form.uf} onChange={change} isInvalid={ufInvalid} /></Col></Row>
              <Form.Group><Form.Label>Capacidade</Form.Label><Form.Control type="number" min="1" max="1000000" name="max_attendees" value={form.max_attendees} onChange={change} isInvalid={capacityInvalid || Boolean(fieldError("max_attendees"))} /><Form.Control.Feedback type="invalid">{fieldError("max_attendees") || "Use um valor maior que zero."}</Form.Control.Feedback></Form.Group>
              <Button type="submit" disabled={!canSave}>Salvar alterações</Button>
            </div></Card.Body></Card>

              <Card className="cut-panel"><Card.Body className="p-4"><div className="d-flex justify-content-between gap-3 align-items-start"><div><span className="cut-eyebrow">Publicação</span><h2 className="cut-section-title mt-2">{eventData?.is_published ? "Evento no ar" : "Evento em rascunho"}</h2></div><Badge bg={eventData?.is_published ? "success" : "secondary"}>{eventData?.is_published ? "Publicado" : "Rascunho"}</Badge></div><div className="cut-info-box mt-3"><strong>{eventData?.tickets_count || 0} lote(s) configurado(s)</strong><span>Para publicar, o evento precisa estar no futuro e possuir ao menos uma cortesia gratuita disponível.</span></div><div className="d-grid gap-2 mt-3"><Button variant="outline-light" onClick={() => navigate(`/event/${id}/courtesies`)}>Gerenciar cortesias</Button><Button variant="outline-light" onClick={() => navigate(`/ticket/create?eventId=${id}`)}>Criar nova cortesia</Button><Button onClick={togglePublication} disabled={publishing || eventData?.is_cancelled}>{eventData?.is_published ? "Retirar da publicação" : "Publicar evento"}</Button>{eventData?.is_published && <Button variant="outline-light" onClick={() => navigate(`/checkin?eventId=${id}`)}>Abrir portaria deste evento</Button>}</div></Card.Body></Card>
            </Col>
          </Row>

          <Card className="cut-panel mt-4"><Card.Body className="p-4 p-lg-5">
            <div className="d-flex flex-column flex-lg-row justify-content-between gap-3 align-items-lg-start mb-4">
              <div><span className="cut-eyebrow">Monetização do evento</span><h2 className="cut-section-title mt-2">Adicionais e pré-venda</h2><p className="text-secondary mb-0">Venda itens e serviços junto do ingresso para aumentar o ticket médio. O valor entra no mesmo checkout e segue as taxas vigentes, sem cobrança escondida.</p></div>
              <Badge bg={eventItems.length ? "success" : "secondary"}>{eventItems.length} adicional(is) ativo(s)</Badge>
            </div>
            <Row className="g-3 align-items-end">
              <Col md={5}><Form.Group><Form.Label>Nome do adicional *</Form.Label><Form.Control value={itemForm.name} maxLength={140} onChange={(e) => setItemForm((current) => ({ ...current, name: e.target.value }))} placeholder="Ex.: estacionamento, combo, camiseta" /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>Preço real *</Form.Label><Form.Control type="number" min="0.01" step="0.01" value={itemForm.price} onChange={(e) => setItemForm((current) => ({ ...current, price: e.target.value }))} placeholder="0,00" /></Form.Group></Col>
              <Col md={2}><Form.Group><Form.Label>Estoque *</Form.Label><Form.Control type="number" min="0" step="1" value={itemForm.quantity} onChange={(e) => setItemForm((current) => ({ ...current, quantity: e.target.value }))} placeholder="0" /></Form.Group></Col>
              <Col md={2}><Button type="button" className="w-100" onClick={saveAddOn} disabled={itemSaving}>{itemSaving ? "Salvando..." : "Adicionar"}</Button></Col>
              <Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={2} maxLength={2000} value={itemForm.description} onChange={(e) => setItemForm((current) => ({ ...current, description: e.target.value }))} placeholder="Explique o que o comprador recebe e como retirar/usar no evento." /></Form.Group></Col>
            </Row>
            {Number(itemForm.price) > 0 && Number(itemForm.quantity) >= 0 && <div className="cut-info-box mt-3"><strong>Potencial bruto deste estoque: {(Number(itemForm.price) * Number(itemForm.quantity || 0)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong><span>É apenas uma referência de GMV se todo o estoque for vendido; não é garantia de receita e não altera o take rate.</span></div>}
            <div className="mt-4">
              {itemLoading ? <div className="text-secondary">Carregando adicionais...</div> : eventItems.length === 0 ? <Alert variant="info" className="mb-0">Nenhum adicional ativo. Você pode começar com itens de conveniência, alimentação, estacionamento, merchandising ou experiências relacionadas ao evento.</Alert> : <Row className="g-3">{eventItems.map((item) => <Col md={6} key={item.id}><div className="cut-info-box h-100"><div className="d-flex justify-content-between gap-3"><div><strong>{item.name}</strong><span>{Number(item.price || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · estoque {Number(item.quantity || 0)}</span>{item.description && <small className="d-block text-secondary mt-1">{item.description}</small>}</div><Button type="button" size="sm" variant="outline-danger" disabled={itemBusyId === item.id} onClick={() => removeAddOn(item)}>{itemBusyId === item.id ? "Removendo..." : "Remover"}</Button></div></div></Col>)}</Row>}
            </div>
          </Card.Body></Card>
        </Form>}
      </Container>
    </div>
  );
}
