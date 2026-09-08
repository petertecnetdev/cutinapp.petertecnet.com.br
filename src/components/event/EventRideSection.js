import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import appApiClient from "../../services/AppApiClient";

const emptyForm = {
  kind: "offer",
  origin_city: "",
  origin_region: "",
  origin_label: "",
  meeting_point: "",
  departure_at: "",
  seats: 1,
  cost_type: "free",
  suggested_cost: "",
  notes: "",
};

const money = (value) => new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(Number(value || 0));

const dateTime = (value) => value ? new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
}).format(new Date(value)) : "";

const nameOf = (person) => [person?.first_name, person?.last_name].filter(Boolean).join(" ") || "Participante";
const initials = (person) => `${person?.first_name?.[0] || "U"}${person?.last_name?.[0] || ""}`.toUpperCase();

const costLabel = (ride) => {
  if (ride.cost_type === "free") return "Gratuita";
  if (ride.cost_type === "share") return ride.suggested_cost != null ? `Dividir custos · ${money(ride.suggested_cost)}` : "Dividir custos";
  return "Valor combinado";
};

export default function EventRideSection({ event }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState("all");

  const login = () => navigate("/login", { state: { from: `${location.pathname}${location.search}#ride` } });

  const load = useCallback(async () => {
    if (!user?.id || !event?.id) {
      setRides([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await appApiClient.get(`/events/${Number(event.id)}/rides`);
      setRides(Array.isArray(response?.data?.rides) ? response.data.rides : []);
    } catch (err) {
      setMessage({ type: "danger", text: err?.response?.data?.message || err?.message || "Não foi possível carregar os Rides deste evento." });
    } finally {
      setLoading(false);
    }
  }, [event?.id, user?.id]);

  useEffect(() => { load(); }, [load]);

  const visibleRides = useMemo(() => rides.filter((ride) => filter === "all" || ride.kind === filter), [rides, filter]);
  const offers = rides.filter((ride) => ride.kind === "offer").length;
  const looking = rides.filter((ride) => ride.kind === "request").length;

  const openForm = (kind) => {
    if (!user) return login();
    const suggestedDeparture = event?.start_date
      ? new Date(new Date(event.start_date).getTime() - 60 * 60 * 1000).toISOString().slice(0, 16)
      : "";
    setForm({ ...emptyForm, kind, origin_city: user?.city || "", departure_at: suggestedDeparture });
    setShowForm(true);
  };

  const createRide = async () => {
    if (!user) return login();
    if (!form.origin_city.trim() || !form.departure_at) {
      setMessage({ type: "warning", text: "Informe a cidade de saída e o horário." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const payload = {
        ...form,
        origin_city: form.origin_city.trim(),
        origin_region: form.origin_region.trim() || undefined,
        origin_label: form.origin_label.trim() || undefined,
        meeting_point: form.meeting_point.trim() || undefined,
        seats: Number(form.seats || 1),
        suggested_cost: form.suggested_cost === "" ? undefined : Number(form.suggested_cost),
        notes: form.notes.trim() || undefined,
      };
      await appApiClient.post(`/events/${Number(event.id)}/rides`, payload);
      setShowForm(false);
      setMessage({ type: "success", text: form.kind === "offer" ? "Sua carona foi publicada no Ride." : "Seu pedido de carona foi publicado no Ride." });
      await load();
    } catch (err) {
      const errors = err?.response?.data?.errors;
      const detail = errors ? Object.values(errors).flat()[0] : null;
      setMessage({ type: "danger", text: detail || err?.response?.data?.message || err?.message || "Não foi possível publicar o Ride." });
    } finally {
      setBusy(false);
    }
  };

  const requestSeat = async (ride) => {
    if (!user) return login();
    setBusy(true);
    setMessage(null);
    try {
      await appApiClient.post(`/rides/${ride.id}/requests`, { seats: 1 });
      setMessage({ type: "success", text: "Solicitação enviada. O motorista poderá aceitar ou recusar." });
      await load();
    } catch (err) {
      const errors = err?.response?.data?.errors;
      const detail = errors ? Object.values(errors).flat()[0] : null;
      setMessage({ type: "danger", text: detail || err?.response?.data?.message || err?.message || "Não foi possível solicitar a vaga." });
    } finally {
      setBusy(false);
    }
  };

  const respond = async (ride, request, status) => {
    setBusy(true);
    setMessage(null);
    try {
      await appApiClient.patch(`/rides/${ride.id}/requests/${request.id}`, { status });
      setMessage({ type: "success", text: status === "accepted" ? "Solicitação aceita." : "Solicitação recusada." });
      await load();
    } catch (err) {
      const errors = err?.response?.data?.errors;
      const detail = errors ? Object.values(errors).flat()[0] : null;
      setMessage({ type: "danger", text: detail || err?.response?.data?.message || err?.message || "Não foi possível responder a solicitação." });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (ride) => {
    if (!window.confirm("Cancelar este Ride? Solicitações pendentes também serão encerradas.")) return;
    setBusy(true);
    setMessage(null);
    try {
      await appApiClient.delete(`/rides/${ride.id}`);
      setMessage({ type: "success", text: "Ride cancelado." });
      await load();
    } catch (err) {
      setMessage({ type: "danger", text: err?.response?.data?.message || err?.message || "Não foi possível cancelar o Ride." });
    } finally {
      setBusy(false);
    }
  };

  const openProfile = (person) => {
    if (!person?.id) return;
    navigate(user && Number(user.id) === Number(person.id) ? "/profile" : `/profile/${person.id}`);
  };

  return <section id="ride" className="mb-5" style={{ scrollMarginTop: "calc(var(--cut-navbar-height) + 18px)" }}>
    <Card className="cut-panel overflow-hidden">
      <Card.Body className="p-4 p-lg-5">
        <div className="d-flex flex-column flex-lg-row align-items-lg-start justify-content-between gap-4 mb-4">
          <div>
            <span className="cut-eyebrow">Ride</span>
            <h2 className="cut-section-title mt-2 mb-2">Vá junto para este evento</h2>
            <p className="text-secondary mb-0">Ofereça uma carona ou encontre alguém que esteja saindo da sua região. O ponto exato de encontro só é revelado após a solicitação ser aceita.</p>
          </div>
          <div className="d-flex flex-wrap gap-2 flex-shrink-0">
            <Button onClick={() => openForm("offer")}><i className="fa-solid fa-car-side me-2" />Oferecer carona</Button>
            <Button variant="outline-light" onClick={() => openForm("request")}><i className="fa-solid fa-person-walking-arrow-right me-2" />Preciso de carona</Button>
          </div>
        </div>

        {message && <Alert variant={message.type} dismissible onClose={() => setMessage(null)}>{message.text}</Alert>}

        {!user ? <div className="cut-empty-state-inline py-4">
          <i className="fa-solid fa-car-side fs-2 mb-3" />
          <p>Entre na sua conta para ver e participar dos Rides deste evento.</p>
          <Button onClick={login}>Entrar para usar o Ride</Button>
        </div> : <>
          <div className="d-flex flex-wrap gap-2 mb-4">
            <Button size="sm" variant={filter === "all" ? "light" : "outline-light"} onClick={() => setFilter("all")}>Todos <Badge bg="secondary" className="ms-1">{rides.length}</Badge></Button>
            <Button size="sm" variant={filter === "offer" ? "light" : "outline-light"} onClick={() => setFilter("offer")}>Oferecendo <Badge bg="secondary" className="ms-1">{offers}</Badge></Button>
            <Button size="sm" variant={filter === "request" ? "light" : "outline-light"} onClick={() => setFilter("request")}>Procurando <Badge bg="secondary" className="ms-1">{looking}</Badge></Button>
          </div>

          {loading ? <div className="d-flex align-items-center gap-2 text-secondary py-4"><Spinner size="sm" />Carregando Rides...</div> : visibleRides.length === 0 ? <div className="cut-empty-state-inline py-4"><p className="mb-1">Ainda não há Ride nesta categoria.</p><small className="text-secondary">Seja a primeira pessoa a combinar o caminho para o evento.</small></div> : <Row className="g-3">
            {visibleRides.map((ride) => <Col lg={6} key={ride.id}>
              <Card className="h-100 cut-panel">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                    <button type="button" onClick={() => openProfile(ride.owner)} className="d-flex align-items-center gap-2 text-start" style={{ border: 0, padding: 0, background: "transparent", color: "inherit" }}>
                      <span className="cut-community-avatar cut-community-avatar--sm">{ride.owner?.avatar ? <img src={ride.owner.avatar} alt={nameOf(ride.owner)} /> : initials(ride.owner)}</span>
                      <span><strong className="d-block">{nameOf(ride.owner)}</strong><small className="text-secondary">{ride.kind === "offer" ? "oferece carona" : "procura carona"}</small></span>
                    </button>
                    <Badge bg={ride.status === "open" ? "success" : "secondary"}>{ride.status === "open" ? "Aberto" : ride.status === "full" ? "Lotado" : ride.status}</Badge>
                  </div>

                  <div className="d-grid gap-2 small mb-3">
                    <span><i className="fa-solid fa-location-dot me-2" /><strong>Saída:</strong> {[ride.origin_region, ride.origin_city].filter(Boolean).join(" · ")}</span>
                    {ride.origin_label && <span><i className="fa-solid fa-map-pin me-2" />{ride.origin_label}</span>}
                    <span><i className="fa-regular fa-clock me-2" /><strong>Horário:</strong> {dateTime(ride.departure_at)}</span>
                    {ride.kind === "offer" && <span><i className="fa-solid fa-users me-2" /><strong>Vagas:</strong> {ride.available_seats} de {ride.seats} disponíveis</span>}
                    {ride.kind === "offer" && <span><i className="fa-solid fa-wallet me-2" /><strong>Custo:</strong> {costLabel(ride)}</span>}
                    {ride.meeting_point && <Alert variant="success" className="mb-0 py-2"><strong>Ponto combinado:</strong> {ride.meeting_point}</Alert>}
                  </div>
                  {ride.notes && <p className="text-secondary small">{ride.notes}</p>}

                  {ride.is_owner ? <div className="border-top pt-3 mt-3">
                    <div className="d-flex justify-content-between align-items-center gap-2 mb-2"><strong className="small">Solicitações</strong><Button size="sm" variant="outline-danger" disabled={busy} onClick={() => cancel(ride)}>Cancelar Ride</Button></div>
                    {ride.kind === "offer" && (ride.requests?.length ? <div className="d-grid gap-2">{ride.requests.map((request) => <div key={request.id} className="border rounded p-2">
                      <div className="d-flex justify-content-between gap-2"><button type="button" onClick={() => openProfile(request.user)} style={{ border: 0, padding: 0, background: "transparent", color: "inherit", fontWeight: 700 }}>{nameOf(request.user)}</button><Badge bg={request.status === "pending" ? "warning" : request.status === "accepted" ? "success" : "secondary"}>{request.status}</Badge></div>
                      {request.message && <small className="text-secondary d-block mt-1">{request.message}</small>}
                      {request.status === "pending" && <div className="d-flex gap-2 mt-2"><Button size="sm" disabled={busy} onClick={() => respond(ride, request, "accepted")}>Aceitar</Button><Button size="sm" variant="outline-light" disabled={busy} onClick={() => respond(ride, request, "rejected")}>Recusar</Button></div>}
                    </div>)}</div> : <small className="text-secondary">Nenhuma solicitação ainda.</small>)}
                  </div> : ride.kind === "offer" ? <div className="d-flex justify-content-between align-items-center gap-2 border-top pt-3 mt-3">
                    <small className="text-secondary">{ride.my_request ? `Sua solicitação: ${ride.my_request.status}` : "Quer ir com esta pessoa?"}</small>
                    {!ride.my_request && ride.status === "open" && ride.available_seats > 0 && <Button size="sm" disabled={busy} onClick={() => requestSeat(ride)}>Solicitar vaga</Button>}
                  </div> : null}
                </Card.Body>
              </Card>
            </Col>)}
          </Row>}
        </>}
      </Card.Body>
    </Card>

    <Modal show={showForm} onHide={() => !busy && setShowForm(false)} centered className="cut-modal">
      <Modal.Header closeButton><Modal.Title>{form.kind === "offer" ? "Oferecer carona" : "Procurar carona"}</Modal.Title></Modal.Header>
      <Modal.Body>
        <Alert variant="info" className="small">Não publique endereço residencial. Informe apenas a região publicamente; o ponto exato fica protegido até uma solicitação ser aceita.</Alert>
        <Row className="g-3">
          <Col md={6}><Form.Group><Form.Label>Cidade de saída *</Form.Label><Form.Control value={form.origin_city} onChange={(e) => setForm((current) => ({ ...current, origin_city: e.target.value }))} maxLength={120} /></Form.Group></Col>
          <Col md={6}><Form.Group><Form.Label>Bairro ou região</Form.Label><Form.Control value={form.origin_region} onChange={(e) => setForm((current) => ({ ...current, origin_region: e.target.value }))} maxLength={160} /></Form.Group></Col>
          <Col xs={12}><Form.Group><Form.Label>Ponto público aproximado</Form.Label><Form.Control value={form.origin_label} onChange={(e) => setForm((current) => ({ ...current, origin_label: e.target.value }))} placeholder="Ex.: Shopping, praça, posto conhecido" maxLength={200} /></Form.Group></Col>
          {form.kind === "offer" && <Col xs={12}><Form.Group><Form.Label>Ponto exato após aceite</Form.Label><Form.Control value={form.meeting_point} onChange={(e) => setForm((current) => ({ ...current, meeting_point: e.target.value }))} placeholder="Só motorista e passageiros aceitos verão" maxLength={255} /></Form.Group></Col>}
          <Col md={form.kind === "offer" ? 8 : 12}><Form.Group><Form.Label>Horário de saída *</Form.Label><Form.Control type="datetime-local" value={form.departure_at} onChange={(e) => setForm((current) => ({ ...current, departure_at: e.target.value }))} /></Form.Group></Col>
          {form.kind === "offer" && <Col md={4}><Form.Group><Form.Label>Vagas</Form.Label><Form.Control type="number" min={1} max={8} value={form.seats} onChange={(e) => setForm((current) => ({ ...current, seats: e.target.value }))} /></Form.Group></Col>}
          {form.kind === "offer" && <><Col md={6}><Form.Group><Form.Label>Custos</Form.Label><Form.Select value={form.cost_type} onChange={(e) => setForm((current) => ({ ...current, cost_type: e.target.value }))}><option value="free">Gratuita</option><option value="share">Dividir combustível/pedágio</option><option value="negotiated">Valor combinado</option></Form.Select></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Valor sugerido</Form.Label><Form.Control type="number" min="0" step="0.01" disabled={form.cost_type === "free"} value={form.suggested_cost} onChange={(e) => setForm((current) => ({ ...current, suggested_cost: e.target.value }))} /></Form.Group></Col></>}
          <Col xs={12}><Form.Group><Form.Label>Observações</Form.Label><Form.Control as="textarea" rows={3} maxLength={1200} value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} placeholder={form.kind === "offer" ? "Ex.: sem fumar no carro, espaço para mochila..." : "Ex.: consigo encontrar em algum ponto da região..."} /></Form.Group></Col>
        </Row>
      </Modal.Body>
      <Modal.Footer><Button variant="outline-light" disabled={busy} onClick={() => setShowForm(false)}>Cancelar</Button><Button disabled={busy || !form.origin_city.trim() || !form.departure_at} onClick={createRide}>{busy ? "Publicando..." : "Publicar no Ride"}</Button></Modal.Footer>
    </Modal>
  </section>;
}

EventRideSection.propTypes = {
  event: PropTypes.shape({
    id: PropTypes.number.isRequired,
    start_date: PropTypes.string,
  }).isRequired,
};
