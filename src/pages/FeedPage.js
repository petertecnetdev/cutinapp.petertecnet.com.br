import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../components/NavlogComponent";
import SkeletonCard from "../components/SkeletonCard";
import cutinappService from "../services/CutinappService";
import { storageUrl } from "../config";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";

export default function FeedPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    cutinappService.feed({ per_page: 30 })
      .then((response) => active && setEvents(response.feed?.data || []))
      .catch((err) => active && setError(err?.message || "Não foi possível montar seu feed agora."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const openEvent = (event) => navigate(`/event/${event.slug}`);

  return <div className="cut-app-page"><NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5"><div className="cut-page-heading"><div><span className="cut-eyebrow">Seu universo de eventos</span><h1>Feed Cutinapp</h1><p>Eventos das produções e artistas que você acompanha, combinados com o que está acontecendo perto e em breve.</p></div><Button variant="outline-light" onClick={() => navigate("/event")}>Explorar tudo</Button></div>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <Row className="g-4" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <Col md={6} xl={4} key={index}><SkeletonCard /></Col>)}</Row> : events.length === 0 ? <Card className="cut-empty-state"><Card.Body><div className="cut-empty-icon"><i className="fa-solid fa-bolt" /></div><h2>Seu feed está começando</h2><p>Siga artistas e produções para personalizar esta área. Enquanto isso, explore eventos da sua cidade.</p><div className="cut-card-actions justify-content-center"><Button onClick={() => navigate("/event")}>Descobrir eventos</Button><Button variant="outline-light" onClick={() => navigate("/artists")}>Descobrir artistas</Button></div></Card.Body></Card> : <Row className="g-4">{events.map((event) => <Col md={6} xl={4} key={event.id}><Card className="cut-feed-card h-100" onClick={() => openEvent(event)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEvent(event); } }} role="link" tabIndex={0}><div className="cut-event-card__media">{event.image ? <img src={`${storageUrl}${String(event.image).replace(/^\//, "")}`} alt={event.title} loading="lazy" /> : <div className="cut-event-card__placeholder"><i className="fa-regular fa-calendar" /></div>}{event.passes_available_count > 0 && <Badge bg="success" className="cut-event-card__badge">Ingresso disponível</Badge>}</div><Card.Body className="p-4"><div className="cut-feed-source"><span>{event.production?.name || "Cutinapp"}</span><small>{event.city || ""}</small></div><h2>{event.title}</h2><p><i className="fa-regular fa-calendar me-2" />{fmt(event.start_date)}</p>{event.artists?.length > 0 && <div className="cut-lineup-preview">{event.artists.slice(0,4).map((artist) => <span key={artist.id}>{artist.stage_name}</span>)}</div>}</Card.Body></Card></Col>)}</Row>}
    </Container>
  </div>;
}
