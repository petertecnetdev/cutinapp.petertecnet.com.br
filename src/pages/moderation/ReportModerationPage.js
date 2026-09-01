import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import cutinappService from "../../services/CutinappService";

const labels = { open: "Aberta", reviewing: "Em análise", resolved: "Resolvida", dismissed: "Descartada" };
const variants = { open: "danger", reviewing: "warning", resolved: "success", dismissed: "secondary" };
const reasonLabels = { fraud: "Fraude ou golpe", misleading: "Informações enganosas", safety: "Risco à segurança", illegal: "Conteúdo ilegal", hate: "Ódio/discriminação", harassment: "Assédio", spam: "Spam", copyright: "Direitos autorais", other: "Outro" };
const fmt = (value) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value)) : "";

export default function ReportModerationPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await cutinappService.moderationReports({ status: status || undefined, q: query || undefined, per_page: 50 })); }
    catch (err) { setError(err?.message || "Não foi possível carregar as denúncias. Confirme se sua conta possui acesso de moderação."); }
    finally { setLoading(false); }
  }, [status, query]);

  useEffect(() => { load(); }, [load]);

  const update = async (report, nextStatus) => {
    setBusyId(report.id); setError("");
    try {
      await cutinappService.updateModerationReport(report.id, { status: nextStatus, moderation_note: notes[report.id] || report.moderation_note || "" });
      await load();
    } catch (err) { setError(err?.message || "Não foi possível atualizar esta denúncia."); }
    finally { setBusyId(null); }
  };

  const reports = data?.reports?.data || [];
  const counts = data?.counts || {};

  return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-4 py-lg-5">
    <div className="cut-page-heading"><div><span className="cut-eyebrow">Segurança da comunidade</span><h1>Moderação de denúncias</h1><p>Analise relatos de usuários sem expor informações desnecessárias na área pública.</p></div></div>
    {error && <Alert variant="danger">{error}</Alert>}
    <div className="cut-moderation-stats">{Object.keys(labels).map((key) => <button type="button" key={key} className={status === key ? "active" : ""} onClick={() => setStatus(key)}><strong>{counts[key] || 0}</strong><span>{labels[key]}</span></button>)}</div>
    <Card className="cut-panel mb-4"><Card.Body><Row className="g-3 align-items-end"><Col md={8}><Form.Label>Pesquisar</Form.Label><Form.Control value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Evento, participante, e-mail ou conteúdo da denúncia" /></Col><Col md={4}><Button className="w-100" onClick={load}>Pesquisar</Button></Col></Row></Card.Body></Card>
    {loading ? <div className="cut-notification-list" aria-busy="true">{Array.from({ length: 4 }).map((_, index) => <div className="cut-notification-skeleton" key={index} />)}</div> : reports.length === 0 ? <Card className="cut-empty-state"><Card.Body><i className="fa-solid fa-shield-halved cut-empty-icon" /><h2>Nenhuma denúncia neste filtro</h2><p>Não existem denúncias para a situação selecionada.</p></Card.Body></Card> : <div className="cut-moderation-list">{reports.map((report) => <Card className="cut-panel cut-report-card" key={report.id}><Card.Body>
      <div className="cut-report-card__head"><div><Badge bg={variants[report.status] || "secondary"}>{labels[report.status] || report.status}</Badge><span>{reasonLabels[report.reason] || report.reason}</span></div><time>{fmt(report.created_at)}</time></div>
      <button type="button" className="cut-report-card__event" onClick={() => navigate(`/event/${report.event_slug}`)}><strong>{report.event_title}</strong><i className="fa-solid fa-arrow-up-right-from-square" /></button>
      <p>{report.details || "O usuário não adicionou detalhes."}</p>
      <small>Enviada por {[report.reporter_first_name, report.reporter_last_name].filter(Boolean).join(" ") || report.reporter_email} · {report.reporter_email}</small>
      <Form.Group className="mt-3"><Form.Label>Nota da moderação</Form.Label><Form.Control as="textarea" rows={2} value={notes[report.id] ?? report.moderation_note ?? ""} onChange={(e) => setNotes((current) => ({ ...current, [report.id]: e.target.value }))} placeholder="Registre o que foi verificado e a decisão tomada." /></Form.Group>
      <div className="cut-card-actions mt-3"><Button variant="outline-warning" disabled={busyId === report.id} onClick={() => update(report, "reviewing")}>Em análise</Button><Button variant="outline-success" disabled={busyId === report.id} onClick={() => update(report, "resolved")}>Resolver</Button><Button variant="outline-secondary" disabled={busyId === report.id} onClick={() => update(report, "dismissed")}>Descartar</Button></div>
    </Card.Body></Card>)}</div>}
  </Container></div>;
}
