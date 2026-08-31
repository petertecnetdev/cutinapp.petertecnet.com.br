import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import { AuthContext } from "../../context/AuthContext";
import eventService from "../../services/EventService";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value))
  : "Data não informada";

const buildMapEmbedUrl = (event) => {
  if (!event) return "";
  let query = "";
  if (event.google_maps_url) {
    try {
      const url = new URL(event.google_maps_url);
      query = url.searchParams.get("q") || url.searchParams.get("query") || "";
      if (!query && url.pathname.includes("/place/")) {
        query = decodeURIComponent(url.pathname.split("/place/")[1]?.split("/")[0] || "").replace(/\+/g, " ");
      }
    } catch (_) {
      query = "";
    }
  }
  if (!query) {
    query = [event.venue, event.address, event.city, event.uf].filter(Boolean).join(", ");
  }
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : "";
};

export default function EventViewPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    eventService.view(slug)
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar este evento."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [slug]);

  const event = data?.event || null;
  const tickets = useMemo(() => (data?.tickets || []).filter((ticket) => Number(ticket.price) === 0), [data]);
  const isOwner = Boolean(event?.production?.user_id && Number(event.production.user_id) === Number(user?.id));
  const mapEmbedUrl = useMemo(() => buildMapEmbedUrl(event), [event]);

  const claim = async (ticket) => {
    if (!user) {
      navigate("/login", { state: { from: `${location.pathname}${location.search}` } });
      return;
    }
    if (!ticket.available) return;

    setClaimingId(ticket.id);
    setError("");
    setSuccess("");
    try {
      const response = await cutinappService.claimCourtesy(ticket.id);
      setSuccess(response.already_issued ? "Você já tinha este ingresso. Abrindo sua carteira..." : "Ingresso emitido. Seu QR Code já está disponível.");
      window.setTimeout(() => navigate(`/passes/${response.pass?.id || ""}`.replace(/\/$/, "")), 500);
    } catch (err) {
      setError(err?.message || "Não foi possível retirar esta cortesia.");
    } finally {
      setClaimingId(null);
    }
  };

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: event?.title || "Evento Cutinapp", url });
      else {
        await navigator.clipboard.writeText(url);
        setSuccess("Link do evento copiado.");
      }
    } catch (err) {
      if (err?.name !== "AbortError") setError("Não foi possível compartilhar neste navegador.");
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || claimingId) && <ProcessingIndicatorComponent label={claimingId ? "Emitindo ingresso" : "Carregando evento"} />}

      {!loading && event && <>
        <section className="cut-event-hero" style={event.image ? { backgroundImage: `linear-gradient(180deg,rgba(3,10,16,.18),rgba(3,10,16,.96)),url(${storageUrl}${String(event.image).replace(/^\//, "")})` } : undefined}>
          <Container className="cut-page-container"><div className="cut-event-hero__content"><Badge bg="success" className="mb-3">Evento publicado</Badge><h1>{event.title}</h1><p>{formatDate(event.start_date)}</p><span>{event.venue || event.address}</span><span>{event.production?.name ? `Por ${event.production.name}` : ""}</span><div className="cut-card-actions mt-4"><Button onClick={share}><i className="fa-solid fa-share-nodes me-2" />Compartilhar</Button>{event.google_maps_url && <Button variant="outline-light" as="a" href={event.google_maps_url} target="_blank" rel="noreferrer"><i className="fa-solid fa-location-arrow me-2" />Abrir no Maps</Button>}{user && <Button variant="outline-light" onClick={() => navigate("/passes")}>Meus ingressos</Button>}</div></div></Container>
        </section>

        <Container className="cut-page-container py-4 py-lg-5">
          {error && <Alert variant="danger">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}
          <Row className="g-4">
            <Col lg={8}>
              <Card className="cut-panel mb-4"><Card.Body className="p-4 p-lg-5"><span className="cut-eyebrow">Sobre o evento</span><h2 className="cut-section-title mt-2">Informações</h2><p className="cut-body-copy">{event.description}</p><div className="cut-event-details"><div><i className="fa-regular fa-calendar" /><span><strong>Início</strong>{formatDate(event.start_date)}</span></div><div><i className="fa-regular fa-clock" /><span><strong>Término</strong>{formatDate(event.end_date)}</span></div><div><i className="fa-solid fa-location-dot" /><span><strong>Local</strong>{event.venue || event.address}</span></div>{event.city && <div><i className="fa-solid fa-map" /><span><strong>Cidade</strong>{event.city}{event.uf ? ` - ${event.uf}` : ""}</span></div>}{event.production?.name && <div><i className="fa-solid fa-bullhorn" /><span><strong>Produção</strong>{event.production.name}</span></div>}</div></Card.Body></Card>
              {mapEmbedUrl && <Card className="cut-panel"><Card.Body className="p-0 overflow-hidden"><iframe title={`Mapa de ${event.title}`} src={mapEmbedUrl} width="100%" height="360" style={{ border: 0, display: "block" }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></Card.Body></Card>}
            </Col>

            <Col lg={4}><Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Entrada</span><h2 className="cut-section-title mt-2">Ingressos gratuitos</h2>
              {tickets.length === 0 ? <div className="cut-empty-state-inline"><p>Nenhuma cortesia gratuita está configurada neste momento.</p>{isOwner && <Button onClick={() => navigate(`/ticket/create?eventId=${event.id}`)}>Criar cortesia</Button>}</div> : <div className="cut-ticket-list">{tickets.map((ticket) => {
                const remaining = Number(ticket.remaining ?? 0);
                const available = Boolean(ticket.available);
                return <div className="cut-ticket-option" key={ticket.id}><div><strong>{ticket.name}</strong><span>Grátis · {ticket.expired ? "prazo encerrado" : available ? `${remaining} restante${remaining === 1 ? "" : "s"}` : "esgotado"}</span>{ticket.limit_date && !ticket.expired && <small>Retirada até {formatDate(ticket.limit_date)}</small>}</div><Button onClick={() => claim(ticket)} disabled={!available || claimingId === ticket.id}>{available ? (user ? "Retirar ingresso" : "Entrar para retirar") : ticket.expired ? "Prazo encerrado" : "Esgotado"}</Button></div>;
              })}</div>}
              {isOwner && <div className="cut-owner-actions mt-4"><Button variant="outline-light" onClick={() => navigate(`/event/edit/${event.id}`)}>Gerenciar evento</Button><Button variant="outline-light" onClick={() => navigate(`/checkin?eventId=${event.id}`)}>Abrir portaria</Button></div>}
            </Card.Body></Card></Col>
          </Row>
        </Container>
      </>}

      {!loading && !event && <Container className="cut-page-container py-5"><Alert variant="danger">{error || "Evento não encontrado ou não está publicado."}</Alert><Button variant="outline-light" onClick={() => navigate("/event")}>Voltar aos eventos</Button></Container>}
    </div>
  );
}
