import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "Data não informada";

const discoveryPathFromPass = (pass) => {
  const params = new URLSearchParams();
  if (pass?.event?.city) params.set("city", pass.event.city);
  if (pass?.event?.uf) params.set("uf", pass.event.uf);
  params.set("available", "1");
  const query = params.toString();
  return query ? `/event?${query}` : "/event";
};

export default function MyPassesPage() {
  const navigate = useNavigate();
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");

  useEffect(() => {
    let active = true;
    cutinappService.myPasses()
      .then((items) => active && setPasses(items))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus ingressos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => passes.filter((pass) => {
    const term = search.trim().toLowerCase();
    const matchesText = !term || [pass.event?.title, pass.ticket?.name, pass.event?.city, pass.event?.venue, pass.holder_name, pass.token].filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
    const isUsed = Boolean(pass.checked_in_at);
    const isCancelled = pass.status === "cancelled" || pass.event?.is_cancelled;
    const matchesStatus = status === "all" || (status === "active" && !isUsed && !isCancelled) || (status === "used" && isUsed) || (status === "cancelled" && isCancelled);
    return matchesText && matchesStatus;
  }), [passes, search, status]);

  const lastAttendedPass = useMemo(() => passes
    .filter((pass) => Boolean(pass.checked_in_at) && !(pass.status === "cancelled" || pass.event?.is_cancelled))
    .sort((a, b) => new Date(b.checked_in_at || b.event?.start_date || 0) - new Date(a.checked_in_at || a.event?.start_date || 0))[0] || null, [passes]);

  return <div className="cut-app-page"><NavlogComponent />{loading && <ProcessingIndicatorComponent label="Carregando sua carteira" />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Carteira digital</span><h1>Meus ingressos</h1><p>Todos os seus ingressos, com QR individual, situação de entrada e acesso rápido aos eventos.</p></div><Button variant="outline-light" onClick={() => navigate("/event")}>Encontrar eventos</Button></div>
      {error && <Alert variant="danger">{error}</Alert>}
      {!loading && lastAttendedPass && <Card className="cut-wallet-toolbar mb-4"><Card.Body className="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3"><div><span className="cut-eyebrow">Seu próximo rolê</span><h2 className="h4 mb-2">Curtiu {lastAttendedPass.event?.title || "seu último evento"}?</h2><p className="mb-0 text-body-secondary">{lastAttendedPass.event?.city ? `Veja os próximos eventos com ingressos disponíveis em ${lastAttendedPass.event.city}.` : "Veja os próximos eventos com ingressos disponíveis e encontre sua próxima experiência."}</p></div><Button onClick={() => navigate(discoveryPathFromPass(lastAttendedPass))}>Ver próximos eventos</Button></Card.Body></Card>}
      <Card className="cut-wallet-toolbar mb-4"><Card.Body><div className="cut-search-bar"><i className="fa-solid fa-magnifying-glass"/><Form.Control value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Evento, lote, local ou código" /></div><div className="cut-filter-shortcuts">{[["active","Válidos"],["used","Utilizados"],["cancelled","Cancelados"],["all","Todos"]].map(([key,label]) => <button type="button" key={key} className={status===key?"active":""} onClick={() => setStatus(key)}>{label}</button>)}</div></Card.Body></Card>
      {!loading && filtered.length === 0 ? <Card className="cut-empty-state"><Card.Body><i className="fa-solid fa-ticket cut-empty-icon"/><h2>{passes.length ? "Nenhum ingresso corresponde aos filtros" : "Sua carteira ainda está vazia"}</h2><p>{passes.length ? "Tente outro termo ou situação." : "Encontre um evento e obtenha seu primeiro ingresso."}</p><Button onClick={() => navigate("/event")}>Explorar eventos</Button></Card.Body></Card> : <Row className="g-4">{filtered.map((pass) => {
        const used = Boolean(pass.checked_in_at); const cancelled = pass.status === "cancelled" || pass.event?.is_cancelled; const state = cancelled ? "Cancelado" : used ? "Utilizado" : "Válido";
        return <Col xl={6} key={pass.id}><Card className={`cut-ticket-wallet-card ${used ? "is-used" : ""} ${cancelled ? "is-cancelled" : ""}`}><div className="cut-ticket-wallet-card__accent"/><Card.Body className="p-0"><div className="cut-ticket-wallet-card__main"><div className="cut-ticket-wallet-card__info"><div className="d-flex flex-wrap gap-2 mb-3"><Badge bg={cancelled ? "danger" : used ? "secondary" : "success"}>{state}</Badge><Badge bg="dark">{pass.ticket?.type || pass.ticket?.ticket_type || "Ingresso"}</Badge></div><span className="cut-eyebrow">{pass.ticket?.name || "Ingresso Cutinapp"}</span><h2>{pass.event?.title || "Evento"}</h2><div className="cut-ticket-wallet-card__meta"><span><i className="fa-regular fa-calendar"/>{formatDate(pass.event?.start_date)}</span><span><i className="fa-solid fa-location-dot"/>{pass.event?.venue || pass.event?.city || "Local do evento"}</span><span><i className="fa-regular fa-user"/>{pass.holder_name || pass.holder_email}</span>{used && <span><i className="fa-solid fa-circle-check"/>Entrada validada em {formatDate(pass.checked_in_at)}</span>}</div></div><div className="cut-ticket-wallet-card__qr"><QrCodeComponent value={pass.token} size={150}/><small>Apresente na entrada</small></div></div><div className="cut-ticket-wallet-card__footer"><span>ID #{pass.id}</span><div className="cut-card-actions"><Button size="sm" onClick={() => navigate(`/passes/${pass.id}`)}>Abrir ingresso</Button>{pass.event?.slug && <Button size="sm" variant="outline-light" onClick={() => navigate(`/event/${pass.event.slug}`)}>Evento</Button>}{used && !cancelled && <Button size="sm" variant="outline-light" onClick={() => navigate(discoveryPathFromPass(pass))}>Ver similares</Button>}</div></div></Card.Body></Card></Col>;
      })}</Row>}
    </Container>
  </div>;
}