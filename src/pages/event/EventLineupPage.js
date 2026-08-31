import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";

const TYPES = ["atração principal", "show", "DJ set", "apresentação", "abertura", "participação especial", "convidado", "palestrante", "outra participação"];

export default function EventLineupPage() {
  const { eventId } = useParams();
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
    setEvent(eventData); setArtists(lineup.artists || []); setMine(owned);
  };
  useEffect(() => { let active = true; load().catch((e) => active && setError(e?.message || "Não foi possível carregar o line-up." )).finally(() => active && setLoading(false)); return () => { active = false; }; }, [eventId]);
  const available = useMemo(() => mine.filter((artist) => !artists.some((linked) => linked.id === artist.id)), [mine, artists]);

  const add = async (e) => {
    e.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try { const response = await cutinappService.attachArtist(eventId, { ...form, artist_id: Number(form.artist_id), sort_order: Number(form.sort_order || 0) }); setArtists(response.artists || []); setSuccess(response.message || "Artista adicionado ao line-up."); setForm({ artist_id: "", participation_type: "show", description: "", scheduled_at: "", stage: "", sort_order: 0, is_headliner: false }); }
    catch (err) { setError(err?.message || "Não foi possível adicionar o artista."); }
    finally { setBusy(false); }
  };

  const remove = async (artistId) => {
    setBusy(true); setError("");
    try { await cutinappService.detachArtist(eventId, artistId); await load(); setSuccess("Artista removido do line-up."); }
    catch (err) { setError(err?.message || "Não foi possível remover o artista."); }
    finally { setBusy(false); }
  };

  return <div className="cut-app-page"><NavlogComponent />{(loading || busy) && <ProcessingIndicatorComponent label={loading ? "Carregando line-up" : "Atualizando line-up"} />}
    <Container className="cut-page-container py-4 py-lg-5"><div className="cut-page-heading"><div><span className="cut-eyebrow">Line-up</span><h1>{event?.title || "Artistas do evento"}</h1><p>Defina artistas, tipo de participação, destaque, horário e palco sem conceder acesso administrativo ao evento.</p></div></div>{error && <Alert variant="danger">{error}</Alert>}{success && <Alert variant="success">{success}</Alert>}
      <Row className="g-4"><Col lg={5}><Card className="cut-panel"><Card.Body className="p-4"><h2 className="cut-section-title">Adicionar artista</h2>{mine.length === 0 ? <div className="cut-info-box"><strong>Nenhum artista cadastrado</strong><span>Cadastre primeiro o perfil do artista no menu Produzir → Artistas.</span></div> : <Form onSubmit={add} className="cut-form-grid"><Form.Group><Form.Label>Artista *</Form.Label><Form.Select required value={form.artist_id} onChange={(e) => setForm({ ...form, artist_id: e.target.value })}><option value="">Selecione</option>{available.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name}</option>)}</Form.Select></Form.Group><Form.Group><Form.Label>Participação *</Form.Label><Form.Select value={form.participation_type} onChange={(e) => setForm({ ...form, participation_type: e.target.value })}>{TYPES.map((type) => <option key={type}>{type}</option>)}</Form.Select></Form.Group><div className="cut-two-cols"><Form.Group><Form.Label>Horário previsto</Form.Label><Form.Control type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></Form.Group><Form.Group><Form.Label>Palco / espaço</Form.Label><Form.Control value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} /></Form.Group></div><Form.Group><Form.Label>Descrição da participação</Form.Label><Form.Control as="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Form.Group><div className="cut-two-cols"><Form.Group><Form.Label>Ordem</Form.Label><Form.Control type="number" min="0" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></Form.Group><Form.Check className="align-self-end mb-2" type="switch" label="Atração principal" checked={form.is_headliner} onChange={(e) => setForm({ ...form, is_headliner: e.target.checked })} /></div><Button type="submit" disabled={!form.artist_id}>Adicionar ao line-up</Button></Form>}</Card.Body></Card></Col><Col lg={7}><div className="cut-section-heading"><div><span className="cut-eyebrow">Escalação atual</span><h2>{artists.length} artista(s)</h2></div></div>{artists.length === 0 ? <Card className="cut-empty-state"><Card.Body><p>O evento ainda não possui artistas vinculados.</p></Card.Body></Card> : <div className="cut-admin-list">{artists.map((artist) => <Card className="cut-panel" key={artist.id}><Card.Body className="p-3"><div className="d-flex justify-content-between gap-3"><div><div className="d-flex gap-2 align-items-center"><strong>{artist.stage_name}</strong>{artist.pivot?.is_headliner && <Badge bg="warning" text="dark">Destaque</Badge>}</div><div className="text-secondary small">{artist.pivot?.participation_type}{artist.pivot?.stage ? ` · ${artist.pivot.stage}` : ""}</div>{artist.pivot?.description && <p className="mb-0 mt-2 text-secondary">{artist.pivot.description}</p>}</div><Button variant="outline-danger" size="sm" onClick={() => remove(artist.id)}>Remover</Button></div></Card.Body></Card>)}</div>}</Col></Row>
    </Container>
  </div>;
}
