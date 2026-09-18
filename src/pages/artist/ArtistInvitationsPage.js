import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Container, Spinner } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import artistService from "../../services/ArtistService";
import { storageUrl } from "../../config";
import "./ArtistInvitationsPage.css";

const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "";
const img = (value) => {
  if (!value) return "";
  const source = String(value);
  return /^https?:\/\//i.test(source) ? source : `${storageUrl}${source.replace(/^\/+/, "")}`;
};
const statusMeta = {
  pending: ["Aguardando resposta", "warning"],
  pending_change: ["Responder novamente", "warning"],
  accepted: ["Confirmado", "success"],
  declined: ["Recusado", "secondary"],
  expired: ["Expirado", "secondary"],
  cancelled_by_producer: ["Cancelado pela produção", "danger"],
  event_cancelled: ["Evento cancelado", "danger"],
};

export default function ArtistInvitationsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ invitations: { data: [] }, pending_count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await artistService.invitations({ per_page: 50 }));
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível carregar seus convites.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const rows = Array.isArray(data?.invitations?.data) ? data.invitations.data : [];
  const groups = useMemo(() => ({
    pending: rows.filter((item) => ["pending", "pending_change"].includes(item.status)),
    upcoming: rows.filter((item) => item.status === "accepted" && new Date(item.start_date).getTime() >= Date.now()),
    history: rows.filter((item) => !["pending", "pending_change"].includes(item.status) && !(item.status === "accepted" && new Date(item.start_date).getTime() >= Date.now())),
  }), [rows]);

  const section = (title, subtitle, items) => <section className="cut-artist-invitations__section">
    <div className="cut-artist-invitations__sectionHead"><div><span className="cut-eyebrow">{title}</span><h2>{subtitle}</h2></div><strong>{items.length}</strong></div>
    {items.length ? <div className="cut-artist-invitations__grid">{items.map((item) => {
      const [label, variant] = statusMeta[item.status] || [item.status, "secondary"];
      const image = img(item.event_image);
      return <Card key={item.id} className="cut-panel cut-artist-invitations__card" onClick={() => navigate(`/artist/invitations/${item.token}`)}>
        <div className="cut-artist-invitations__media">{image ? <img src={image} alt="" loading="lazy" /> : <i className="fa-solid fa-music" />}</div>
        <Card.Body>
          <div className="d-flex justify-content-between gap-2 align-items-start"><div><small>{item.production_name || "Produção"}</small><h3>{item.event_title}</h3></div><Badge bg={variant}>{label}</Badge></div>
          <div className="cut-artist-invitations__meta"><span><i className="fa-regular fa-calendar" />{fmt(item.start_date)}</span>{item.venue && <span><i className="fa-solid fa-location-dot" />{item.venue}</span>}</div>
          <Button variant="outline-light" className="w-100 mt-3">{["pending", "pending_change"].includes(item.status) ? "Responder convite" : "Ver detalhes"}</Button>
        </Card.Body>
      </Card>;
    })}</div> : <Card className="cut-empty-state"><Card.Body><p className="mb-0">Nenhum item nesta seção.</p></Card.Body></Card>}
  </section>;

  return <div className="cut-app-page cut-artist-invitations">
    <NavlogComponent />
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Área do artista</span><h1>Convites e participações</h1><p>Aceite, recuse e acompanhe seus próximos eventos em um só lugar.</p></div>{Number(data?.pending_count || 0) > 0 && <Badge bg="warning" text="dark" className="fs-6">{data.pending_count} aguardando resposta</Badge>}</div>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? <div className="py-5 text-center"><Spinner /><div className="mt-2">Carregando convites…</div></div> : <>
        {section("Ação necessária", "Convites pendentes", groups.pending)}
        {section("Agenda", "Próximas participações", groups.upcoming)}
        {section("Histórico", "Convites e eventos anteriores", groups.history)}
      </>}
    </Container>
  </div>;
}
