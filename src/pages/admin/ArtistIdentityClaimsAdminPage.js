import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import artistService from "../../services/ArtistService";
import { storageUrl } from "../../config";

const imageUrl = (value) => {
  if (!value) return "";
  const image = String(value);
  return /^https?:\/\//i.test(image) ? image : `${storageUrl}${image.replace(/^\/+/, "")}`;
};

const initials = (firstName, lastName, fallback = "A") => `${firstName?.[0] || fallback?.[0] || "A"}${lastName?.[0] || ""}`.toUpperCase();

export default function ArtistIdentityClaimsAdminPage() {
  const [claims, setClaims] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setClaims(await artistService.identityClaimQueue());
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível carregar as reivindicações.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const review = async (claim, decision) => {
    setBusyId(claim.id);
    setError("");
    setSuccess("");
    try {
      const response = await artistService.reviewIdentityClaim(claim.id, decision, notes[claim.id] || "");
      setClaims((current) => current.filter((item) => Number(item.id) !== Number(claim.id)));
      setSuccess(response.message || (decision === "approve" ? "Vínculo aprovado." : "Reivindicação rejeitada."));
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível analisar a reivindicação.");
    } finally {
      setBusyId(null);
    }
  };

  return <div className="cut-app-page">
    <NavlogComponent />
    {loading && <ProcessingIndicatorComponent label="Carregando reivindicações artísticas" />}
    <Container className="cut-page-container py-4 py-lg-5">
      <div className="cut-page-heading mb-4"><div><span className="cut-eyebrow">Administração</span><h1>Reivindicações de perfis artísticos</h1><p>Analise somente os casos em que o vínculo não pôde ser comprovado automaticamente pelo e-mail profissional do perfil.</p></div></div>
      {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}
      {!loading && claims.length === 0 ? <Card className="cut-empty-state"><Card.Body><h2>Nenhuma reivindicação pendente</h2><p>Novas solicitações aparecerão aqui.</p></Card.Body></Card> : <Row className="g-3">
        {claims.map((claim) => <Col xs={12} key={claim.id}><Card className="cut-panel"><Card.Body className="p-4">
          <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div className="d-flex gap-3 align-items-center">
              <div className="cut-artist-card__photo" style={{ width: 64, height: 64, flex: "0 0 64px" }}>{claim.photo ? <img src={imageUrl(claim.photo)} alt="" /> : <span>{String(claim.stage_name || "A").slice(0, 2).toUpperCase()}</span>}</div>
              <div><span className="cut-eyebrow">Perfil reivindicado</span><h2 className="h4 mb-1">{claim.stage_name}</h2><Badge bg="warning" text="dark">Aguardando análise</Badge></div>
            </div>
            <div className="d-flex gap-3 align-items-center">
              <div className="cut-artist-card__photo" style={{ width: 48, height: 48, flex: "0 0 48px" }}>{claim.avatar ? <img src={imageUrl(claim.avatar)} alt="" /> : <span>{initials(claim.first_name, claim.last_name, claim.user_name)}</span>}</div>
              <div><strong className="d-block">{[claim.first_name, claim.last_name].filter(Boolean).join(" ") || claim.user_name || "Usuário"}</strong>{claim.user_name && <small className="text-secondary">@{claim.user_name}</small>}</div>
            </div>
          </div>
          <div className="mt-3 p-3 cut-info-box"><strong>Evidência informada</strong><p className="mb-1 mt-2">{claim.evidence_text || "Nenhuma descrição adicional."}</p>{claim.evidence_url && <a href={claim.evidence_url} target="_blank" rel="noopener noreferrer">{claim.evidence_url}</a>}</div>
          <Form.Group className="mt-3"><Form.Label>Observação da análise</Form.Label><Form.Control as="textarea" rows={2} value={notes[claim.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [claim.id]: event.target.value }))} /></Form.Group>
          <div className="d-flex gap-2 mt-3 flex-wrap"><Button disabled={busyId === claim.id} onClick={() => review(claim, "approve")}><i className="fa-solid fa-check me-2" />Aprovar vínculo</Button><Button disabled={busyId === claim.id} variant="outline-danger" onClick={() => review(claim, "reject")}><i className="fa-solid fa-xmark me-2" />Rejeitar</Button></div>
        </Card.Body></Card></Col>)}
      </Row>}
    </Container>
  </div>;
}
