import React, { useCallback, useEffect, useState } from "react";
import { Alert, Button, Container, Form, Spinner } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import { loadApplicationAdminContext } from "../../components/ApplicationAdminGate";
import appApiClient from "../../services/AppApiClient";

const labels = { event: "Evento", production: "Produção", artist: "Artista" };
const statuses = { pending: "Aguardando análise", needs_info: "Informações adicionais", rejected: "Rejeitada" };

export default function IndependenceClaimsAdminPage() {
  const [status, setStatus] = useState("pending");
  const [claims, setClaims] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [canReview, setCanReview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await appApiClient.get("/admin/independence/claims", { params: { status, per_page: 25 } });
      setClaims(response.data?.data?.data || []);
      setTotal(Number(response.data?.data?.total || 0));
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível carregar as solicitações.");
      setClaims([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    loadApplicationAdminContext().then((context) => {
      if (active) setCanReview(Boolean(context?.is_owner || context?.permissions?.includes("moderation.manage")));
    }).catch(() => active && setCanReview(false));
    return () => { active = false; };
  }, []);

  const review = async (claim, decision) => {
    const note = String(notes[claim.id] || "").trim();
    if (note.length < 5) {
      setError("Informe uma justificativa de pelo menos cinco caracteres.");
      return;
    }
    setBusyId(claim.id);
    setError("");
    setSuccess("");
    try {
      await appApiClient.patch("/admin/independence/claims/" + claim.id, { decision, review_note: note });
      setNotes((current) => ({ ...current, [claim.id]: "" }));
      setSuccess("Solicitação atualizada. Nenhuma titularidade foi transferida.");
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || "Não foi possível concluir a análise.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
          <div>
            <span className="cut-eyebrow">Cutinapp · Curadoria</span>
            <h1 className="h2 mt-2">Solicitações de titularidade</h1>
            <p className="text-secondary mb-0">Analise vínculos com eventos, produções e artistas sem conceder acesso automaticamente.</p>
          </div>
          <Button as={Link} to="/admin" variant="outline-light">Voltar à administração</Button>
        </div>
        <Alert variant="info">Aprovação e transferência de titularidade exigem verificação humana, trilha de auditoria e liberação específica por entidade. Esta etapa permite consultar e solicitar informações ou rejeitar pedidos.</Alert>
        {error && <Alert variant="danger" role="alert" dismissible onClose={() => setError("")}>{error}</Alert>}
        {success && <Alert variant="success" role="status" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

        <div className="d-flex flex-wrap align-items-end justify-content-between gap-3 mb-4">
          <Form.Group style={{ minWidth: 220 }}>
            <Form.Label>Situação</Form.Label>
            <Form.Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="pending">Aguardando análise</option>
              <option value="needs_info">Informações adicionais</option>
              <option value="rejected">Rejeitadas</option>
            </Form.Select>
          </Form.Group>
          <div className="d-flex align-items-center gap-3">
            <span className="text-secondary small">{total} solicitação(ões)</span>
            <Button variant="outline-light" onClick={() => void load()} disabled={loading}>Atualizar</Button>
          </div>
        </div>

        {loading ? <div className="py-5 text-center"><Spinner animation="border" aria-label="Carregando solicitações" /></div>
          : claims.length === 0 ? <p className="text-secondary py-4">Nenhuma solicitação com esta situação.</p>
          : <div className="d-grid gap-3">
            {claims.map((claim) => <section key={claim.id} className="cut-panel p-3 p-md-4" aria-label={"Solicitação " + claim.id}>
              <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
                <div>
                  <span className="cut-eyebrow">Protocolo #{claim.id}</span>
                  <h2 className="h5 mt-2">{labels[claim.entity_type] || "Cadastro"} #{claim.entity_id}</h2>
                  <p className="mb-1">{claim.contact_name}</p>
                  <p className="text-secondary mb-1">{claim.contact_email}</p>
                  {claim.contact_phone && <p className="text-secondary mb-1">{claim.contact_phone}</p>}
                </div>
                <span className="badge text-bg-secondary">{statuses[claim.status] || claim.status}</span>
              </div>
              {claim.message && <p className="mt-3 mb-0">{claim.message}</p>}
              <p className="text-secondary small mt-3 mb-0">Solicitado em {claim.created_at ? new Date(claim.created_at).toLocaleString() : "data não informada"}</p>
              {canReview && ["pending", "needs_info"].includes(claim.status) && (
                <div className="mt-3 pt-3 border-top">
                  <Form.Group>
                    <Form.Label>Justificativa da análise</Form.Label>
                    <Form.Control as="textarea" rows={2} maxLength={2000} value={notes[claim.id] || ""} onChange={(event) => setNotes((current) => ({ ...current, [claim.id]: event.target.value }))} placeholder="Registre as verificações pendentes ou o motivo da rejeição." />
                  </Form.Group>
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    <Button variant="outline-light" disabled={busyId === claim.id} onClick={() => review(claim, "needs_info")}>Solicitar informações</Button>
                    <Button variant="outline-danger" disabled={busyId === claim.id} onClick={() => review(claim, "rejected")}>Rejeitar solicitação</Button>
                  </div>
                </div>
              )}
            </section>)}
          </div>}
      </Container>
    </div>
  );
}
