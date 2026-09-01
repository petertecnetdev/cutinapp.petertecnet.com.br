import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Container } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";

const statusLabel = (status) => ({ pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado", cancelled: "Cancelado" }[status] || status);
const statusVariant = (status) => ({ pending: "warning", approved: "success", rejected: "danger", cancelled: "secondary" }[status] || "secondary");

export default function EventArtistClaimsPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => setData(await cutinappService.eventArtistClaims(eventId));

  useEffect(() => {
    let active = true;
    cutinappService.eventArtistClaims(eventId)
      .then((response) => active && setData(response))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar as reivindicações."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [eventId]);

  const review = async (claim, decision) => {
    setBusyId(claim.id); setError(""); setSuccess("");
    try {
      const response = await cutinappService.reviewArtistClaim(eventId, claim.id, { decision });
      setSuccess(response.message || "Solicitação analisada.");
      await load();
    } catch (err) { setError(err?.message || "Não foi possível analisar a solicitação."); }
    finally { setBusyId(null); }
  };

  const claims = data?.claims || [];

  return <div className="cut-app-page"><NavlogComponent />{(loading || busyId) && <ProcessingIndicatorComponent label={loading ? "Carregando reivindicações" : "Atualizando vínculo"} />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading"><div><span className="cut-eyebrow">Confirmação de identidade</span><h1>Reivindicações de artistas</h1><p>Confirme apenas solicitações de pessoas que você reconhece como o artista realmente vinculado ao evento.</p></div><Button variant="outline-light" onClick={() => navigate(`/event/${eventId}/lineup`)}>Voltar ao line-up</Button></div>
      {error && <Alert variant="danger">{error}</Alert>}{success && <Alert variant="success">{success}</Alert>}
      {data?.event && <Card className="cut-panel mb-4"><Card.Body className="p-4"><span className="cut-eyebrow">Evento</span><h2 className="cut-section-title">{data.event.title}</h2></Card.Body></Card>}
      {!loading && claims.length === 0 ? <Card className="cut-empty-state"><Card.Body><h2>Nenhuma reivindicação</h2><p>Ainda não há artistas solicitando confirmação neste evento.</p></Card.Body></Card> : <div className="cut-admin-list">{claims.map((claim) => <Card className="cut-panel" key={claim.id}><Card.Body className="p-4"><div className="d-flex justify-content-between gap-3 flex-wrap"><div><div className="d-flex align-items-center gap-2 flex-wrap"><strong>{claim.user?.first_name} {claim.user?.last_name || ""}</strong><Badge bg={statusVariant(claim.status)} text={claim.status === "pending" ? "dark" : undefined}>{statusLabel(claim.status)}</Badge></div><div className="text-secondary small">{claim.user?.email}</div><div className="mt-3"><span className="cut-eyebrow">Reivindica o perfil</span><h3 className="mb-1">{claim.artist?.stage_name}</h3><small className="text-secondary">{claim.artist?.artist_type || "artista"}</small></div>{claim.message && <p className="mt-3 mb-0">{claim.message}</p>}</div>{claim.status === "pending" && <div className="d-flex gap-2 align-items-start"><Button variant="success" onClick={() => review(claim, "approve")} disabled={busyId === claim.id}>Aprovar vínculo</Button><Button variant="outline-danger" onClick={() => review(claim, "reject")} disabled={busyId === claim.id}>Rejeitar</Button></div>}</div></Card.Body></Card>)}</div>}
    </Container>
  </div>;
}
