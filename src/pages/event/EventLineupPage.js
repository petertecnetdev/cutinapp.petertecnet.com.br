import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";

const TYPES = ["atração principal", "show", "DJ set", "apresentação", "abertura", "participação especial", "convidado", "palestrante", "outra participação"];
const TYPE_LABELS = { solo: "Solo", band: "Banda", duo: "Duo", group: "Grupo", collective: "Coletivo", orchestra: "Orquestra" };

export default function EventLineupPage() {
  const { eventId } = useParams();
  const mountedRef = useRef(true);
  const actionRef = useRef(false);
  const [event, setEvent] = useState(null);
  const [artists, setArtists] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ artist_id: "", participation_type: "show", description: "", scheduled_at: "", stage: "", sort_order: 0, is_headliner: false });

  const load = async () => {
    const [eventData, lineup, owned] = await Promise.all([eventService.show(eventId), cutinappService.eventArtists(eventId), cutinappService.myArtists()]);
    if (!mountedRef.current) return;
    setEvent(eventData); setArtists(lineup.artists || []); setMine(owned);
  };
  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    load().catch((e) => mountedRef.current && setError(e?.message || "Não foi possível carregar o line-up." )).finally(() => mountedRef.current && setLoading(false));
    return () => { mountedRef.current = false; };
  }, [eventId]);
  const available = useMemo(() => mine.filter((artist) => !artists.some((linked) => linked.id === artist.id)), [mine, artists]);

  const beginAction = () => {
    if (actionRef.current) return false;
    actionRef.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    return true;
  };
  const endAction = () => {
    actionRef.current = false;
    if (mountedRef.current) setBusy(false);
  };

  const add = async (e) => {
    e.preventDefault();
    if (!form.artist_id || !beginAction()) return;
    try {
      const response = await cutinappService.attachArtist(eventId, { ...form, artist_id: Number(form.artist_id), sort_order: Number(form.sort_order || 0) });
      if (!mountedRef.current) return;
      setArtists(response.artists || []);
      setSuccess(response.message || "Atração adicionada ao line-up.");
      setForm({ artist_id: "", participation_type: "show", description: "", scheduled_at: "", stage: "", sort_order: 0, is_headliner: false });
    }
    catch (err) { if (mountedRef.current) setError(err?.message || "Não foi possível adicionar a atração."); }
    finally { endAction(); }
  };

  const remove = async (artistId) => {
    if (!beginAction()) return;
    try {
      await cutinappService.detachArtist(eventId, artistId);
      await load();
      if (mountedRef.current) setSuccess("Atração removida do line-up.");
    }
    catch (err) { if (mountedRef.current) setError(err?.message || "Não foi possível remover a atração."); }
    finally { endAction(); }
  };

  return <div className="cut-app-page"><NavlogComponent />{(loading || busy) && <ProcessingIndicatorComponent label={loading ? "Carregando line-up" : "Atualizando line-up"} />}
    <Container className="cut-page-container py-4 py-lg-5"><div className="cut-page-heading"><div><span className="cut-eyebrow">Line-up</span><h1>{event?.title || "Atrações do evento"}</h1><p>Adicione artistas solo ou formações completas. Bandas e grupos entram uma única vez no line-up; seus integrantes ficam no perfil da formação.</p></div></div>{error && <Alert variant="danger" role="alert" aria-live="assertive">{error}</Alert>}{success && <Alert variant="success" role="status" aria-live="polite">{success}</Alert>}
      <Row className="g-4"><Col lg={5}><Card className="cut-panel"><Card.Body className="p-4"><h2 className="cut-section-title">Adicionar atração</h2>{mine.length === 0 ? <div className="cut-info-box"><strong>Nenhum perfil artístico cadastrado</strong><span>Cadastre primeiro o artista, banda ou grupo no menu Produzir → Artistas.</span></div> : <Form onSubmit={add} className="cut-form-grid" aria-busy={busy}><Form.Group><Form.Label>Artista / formação *</Form.Label><Form.Select required value={form.artist_id} disabled={busy} onChange={(e) => setForm({ ...form, artist_id: e.target.value })}><option value="">Selecione</option>{available.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name} · {TYPE_LABELS[artist.artist_type] || "Solo"}</option>)}</Form.Select></Form.Group><Form.Group><Form.Label>Participação *</Form.Label><Form.Select value={form.participation_type} disabled={busy} onChange={(e) => setForm({ ...form, participation_type: e.target.value })}>{TYPES.map((type) => <option key={type}>{type}</option>)}</Form.Select></Form.Group><div className="cut-two-cols"><Form.Group><Form.Label>Horário previsto</Form.Label><Form.Control type="datetime-local" value={form.scheduled_at} disabled={busy} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></Form.Group><Form.Group><Form.Label>Palco / espaço</Form.Label><Form.Control value={form.stage} disabled={busy} onChange={(e) => setForm({ ...form, stage: e.target.value })} /></Form.Group></div><Form.Group><Form.Label>Descrição da participação</Form.Label><Form.Control as="textarea" rows={3} value={form.description} disabled={busy} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Form.Group><div className="cut-two-cols"><Form.Group><Form.Label>Ordem</Form.Label><Form.Control type="number" min="0" value={form.sort_order} disabled={busy} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></Form.Group><Form.Check className="align-self-end mb-2" type="switch" label="Atração principal" checked={form.is_headliner} disabled={busy} onChange={(e) => setForm({ ...form, is_headliner: e.target.checked })} /></div><Button type="submit" disabled={busy || !form.artist_id}>{busy ? "Atualizando…" : "Adicionar ao line-up"}</Button></Form>}</Card.Body></Card></Col><Col lg={7}><div className="cut-section-heading"><div><span className="cut-eyebrow">Escalação atual</span><h2>{artists.length} atração(ões)</h2></div></div>{artists.length === 0 ? <Card className="cut-empty-state"><Card.Body><p>O evento ainda não possui atrações vinculadas.</p></Card.Body></Card> : <div className="cut-admin-list" aria-busy={busy}>{artists.map((artist) => <Card className="cut-panel" key={artist.id}><Card.Body className="p-3"><div className="d-flex justify-content-between gap-3"><div><div className="d-flex gap-2 align-items-center"><strong>{artist.stage_name}</strong><Badge bg="secondary">{TYPE_LABELS[artist.artist_type] || "Solo"}</Badge>{artist.pivot?.is_headliner && <Badge bg="warning" text="dark">Destaque</Badge>}</div><div className="text-secondary small">{artist.pivot?.participation_type}{artist.pivot?.stage ? ` · ${artist.pivot.stage}` : ""}</div>{artist.pivot?.description && <p className="mb-0 mt-2 text-secondary">{artist.pivot.description}</p>}</div><Button variant="outline-danger" size="sm" disabled={busy} aria-label={`Remover ${artist.stage_name} do line-up`} onClick={() => remove(artist.id)}>Remover</Button></div></Card.Body></Card>)}</div>}</Col></Row>
    </Container>
  </div>;
}
