import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import aiContentService from "../../services/AiContentService";
import artistService from "../../services/ArtistService";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import "./EventLineupPage.css";

const TYPES = ["atração principal", "show", "DJ set", "apresentação", "abertura", "participação especial", "convidado", "palestrante", "outra participação"];
const STATUS_LABELS = {
  pending: ["Aguardando artista", "warning"],
  confirmed: ["Confirmado", "success"],
  declined: ["Recusado", "secondary"],
  cancelled: ["Cancelado", "danger"],
};

const emptySlot = (sortOrder = 0) => ({
  artist_id: "",
  participation_type: "show",
  description: "",
  scheduled_at: "",
  stage: "",
  sort_order: sortOrder,
  is_headliner: false,
  fee_cents: "",
  private_notes: "",
});

const toLocal = (value) => value ? String(value).replace(" ", "T").slice(0, 16) : "";
const errorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;
const initials = (value) => String(value || "A").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

const participationPayload = (form) => ({
  participation_type: form.participation_type || "show",
  description: String(form.description || "").trim() || null,
  scheduled_at: form.scheduled_at || null,
  stage: String(form.stage || "").trim() || null,
  sort_order: Number(form.sort_order || 0),
  is_headliner: Boolean(form.is_headliner),
  fee_cents: form.fee_cents === "" ? null : Number(form.fee_cents || 0),
  private_notes: String(form.private_notes || "").trim() || null,
});

export default function EventLineupPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [artists, setArtists] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState("lookup");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [editingArtistId, setEditingArtistId] = useState(null);
  const [form, setForm] = useState(emptySlot());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [eventData, lineup, owned] = await Promise.all([
        eventService.show(eventId),
        cutinappService.eventArtists(eventId),
        cutinappService.myArtists(),
      ]);
      const next = lineup?.artists || [];
      setEvent(eventData);
      setArtists(next);
      setMine(Array.isArray(owned) ? owned : []);
      setForm((current) => ({ ...current, sort_order: next.length }));
    } catch (err) {
      setError(errorMessage(err, "Não foi possível carregar o line-up."));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (mode !== "lookup") return undefined;
    const value = query.trim();
    setSelectedCandidate(null);
    if (value.length < 2) {
      setCandidates([]);
      return undefined;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        setCandidates(await artistService.searchCandidates(eventId, value));
      } catch (err) {
        setCandidates([]);
        if (err?.response?.status !== 422) setError(errorMessage(err, "Não foi possível pesquisar usuários."));
      } finally {
        setSearching(false);
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [eventId, mode, query]);

  const managedAvailable = useMemo(() => mine.filter((artist) => !artists.some((item) => Number(item.id) === Number(artist.id))), [artists, mine]);
  const confirmed = useMemo(() => artists.filter((artist) => (artist.pivot?.status || "confirmed") === "confirmed").length, [artists]);
  const pending = useMemo(() => artists.filter((artist) => artist.pivot?.status === "pending").length, [artists]);

  const resetEditor = (nextArtists = artists) => {
    setEditingArtistId(null);
    setSelectedCandidate(null);
    setQuery("");
    setCandidates([]);
    setForm(emptySlot(nextArtists.length));
    setMode("lookup");
  };

  const selectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setQuery(candidate.username || candidate.name || query);
    setCandidates([]);
  };

  const saveLookup = async (e) => {
    e.preventDefault();
    const identifier = String(selectedCandidate?.username || query || "").trim();
    if (identifier.length < 2) {
      setError("Informe o @username, e-mail, telefone ou CPF do usuário.");
      return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await artistService.resolveAndInvite(eventId, { identifier, ...participationPayload(form) });
      if (response.external_invitation) {
        setSuccess("A conta ainda não existe. O convite foi criado sem gerar um perfil artístico duplicado.");
      } else {
        setSuccess(response.message || "Artista localizado e convidado para o evento.");
      }
      await load();
      resetEditor();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível adicionar o artista."));
    } finally {
      setBusy(false);
    }
  };

  const saveManaged = async (e) => {
    e.preventDefault();
    if (!form.artist_id) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await cutinappService.attachArtist(eventId, { artist_id: Number(form.artist_id), ...participationPayload(form) });
      const next = response?.artists || [];
      setArtists(next);
      setSuccess("Perfil artístico administrado por você foi adicionado ao line-up.");
      resetEditor(next);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível adicionar este perfil artístico."));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editingArtistId) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await artistService.updateParticipation(eventId, editingArtistId, participationPayload(form));
      const next = response?.artists || [];
      setArtists(next);
      setSuccess("Participação atualizada sem alterar o perfil pessoal do artista.");
      resetEditor(next);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível atualizar a participação."));
    } finally {
      setBusy(false);
    }
  };

  const beginEdit = (artist) => {
    const pivot = artist.pivot || {};
    setEditingArtistId(artist.id);
    setMode("edit");
    setForm({
      artist_id: String(artist.id),
      participation_type: pivot.participation_type || "show",
      description: pivot.description || "",
      scheduled_at: toLocal(pivot.scheduled_at),
      stage: pivot.stage || "",
      sort_order: Number(pivot.sort_order || 0),
      is_headliner: Boolean(pivot.is_headliner),
      fee_cents: pivot.fee_cents ?? "",
      private_notes: pivot.private_notes || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeArtist = async (artist) => {
    setBusy(true); setError("");
    try {
      await cutinappService.detachArtist(eventId, artist.id);
      const next = artists.filter((item) => Number(item.id) !== Number(artist.id));
      setArtists(next);
      setSuccess(`${artist.stage_name} foi removido do line-up.`);
      if (Number(editingArtistId) === Number(artist.id)) resetEditor(next);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível remover o artista."));
    } finally {
      setBusy(false);
    }
  };

  const checkIn = async (artist) => {
    setBusy(true); setError("");
    try {
      await artistService.checkInArtist(eventId, artist.id);
      setSuccess(`Check-in de ${artist.stage_name} confirmado.`);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível confirmar o check-in."));
    } finally {
      setBusy(false);
    }
  };

  const move = async (artistId, direction) => {
    const index = artists.findIndex((artist) => Number(artist.id) === Number(artistId));
    const target = index + direction;
    if (index < 0 || target < 0 || target >= artists.length) return;
    const next = [...artists];
    [next[index], next[target]] = [next[target], next[index]];
    const normalized = next.map((artist, position) => ({ ...artist, pivot: { ...(artist.pivot || {}), sort_order: position } }));
    setArtists(normalized);
    try {
      await artistService.reorderLineup(eventId, normalized.map((artist, position) => ({ artist_id: artist.id, sort_order: position })));
    } catch (err) {
      setArtists(artists);
      setError(errorMessage(err, "Não foi possível reordenar o line-up."));
    }
  };

  const generateDescription = async () => {
    setAiBusy(true); setError("");
    try {
      const title = selectedCandidate?.artist?.stage_name || selectedCandidate?.name || mine.find((artist) => String(artist.id) === String(form.artist_id))?.stage_name || "Participação artística";
      const response = await aiContentService.generateDescription({
        entityType: "artist-event-participation",
        title,
        currentDescription: form.description,
        context: { event: event?.title || "", participation: form.participation_type, stage: form.stage || "", scheduled_at: form.scheduled_at || "" },
      });
      setForm((current) => ({ ...current, description: response.description }));
    } catch (err) {
      setError(errorMessage(err, "Não foi possível gerar a descrição com IA."));
    } finally {
      setAiBusy(false);
    }
  };

  const slotFields = (
    <>
      <Row className="g-3">
        <Col md={6}><Form.Group><Form.Label>Participação *</Form.Label><Form.Select value={form.participation_type} onChange={(e) => setForm({ ...form, participation_type: e.target.value })}>{TYPES.map((type) => <option key={type}>{type}</option>)}</Form.Select></Form.Group></Col>
        <Col md={6}><Form.Group><Form.Label>Palco / espaço</Form.Label><Form.Control value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} placeholder="Ex.: Palco principal" /></Form.Group></Col>
        <Col md={6}><Form.Group><Form.Label>Horário previsto</Form.Label><Form.Control type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></Form.Group></Col>
        <Col md={3}><Form.Group><Form.Label>Ordem</Form.Label><Form.Control type="number" min="0" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></Form.Group></Col>
        <Col md={3} className="d-flex align-items-end"><Form.Check className="mb-2" type="switch" label="Atração principal" checked={form.is_headliner} onChange={(e) => setForm({ ...form, is_headliner: e.target.checked })} /></Col>
        <Col xs={12}>
          <Form.Group>
            <div className="d-flex justify-content-between align-items-center gap-2 mb-1"><Form.Label className="mb-0">Descrição da participação</Form.Label><Button type="button" size="sm" variant="outline-light" disabled={aiBusy} onClick={generateDescription}>{aiBusy ? "Gerando..." : "Gerar com IA"}</Button></div>
            <Form.Control as="textarea" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: DJ set de encerramento" />
          </Form.Group>
        </Col>
        <Col md={6}><Form.Group><Form.Label>Cachê (centavos, opcional)</Form.Label><Form.Control type="number" min="0" value={form.fee_cents} onChange={(e) => setForm({ ...form, fee_cents: e.target.value })} /></Form.Group></Col>
        <Col md={6}><Form.Group><Form.Label>Observação privada da produção</Form.Label><Form.Control value={form.private_notes} onChange={(e) => setForm({ ...form, private_notes: e.target.value })} /></Form.Group></Col>
      </Row>
    </>
  );

  return (
    <div className="cut-app-page cut-lineup-page">
      <NavlogComponent />
      {(loading || busy) && <ProcessingIndicatorComponent label={loading ? "Carregando line-up" : "Atualizando line-up"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-lineup-hero mb-4">
          <div><span className="cut-eyebrow">Line-up do evento</span><h1>{event?.title || "Atrações do evento"}</h1><p>O artista agora é sempre uma identidade real da Cutinapp. O produtor gerencia somente a participação no evento.</p></div>
          <div className="cut-lineup-hero-actions"><Button variant="outline-light" onClick={() => navigate(`/event/edit/${eventId}`)}>Voltar ao evento</Button></div>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

        <Row className="g-3 mb-4">
          <Col sm={4}><Card className="cut-lineup-summary-card h-100"><Card.Body><small>Total</small><strong className="d-block fs-3">{artists.length}</strong></Card.Body></Card></Col>
          <Col sm={4}><Card className="cut-lineup-summary-card h-100"><Card.Body><small>Confirmados</small><strong className="d-block fs-3">{confirmed}</strong></Card.Body></Card></Col>
          <Col sm={4}><Card className="cut-lineup-summary-card h-100"><Card.Body><small>Aguardando resposta</small><strong className="d-block fs-3">{pending}</strong></Card.Body></Card></Col>
        </Row>

        <Card className="cut-lineup-editor-card mb-4">
          <Card.Body>
            <div className="d-flex flex-wrap justify-content-between gap-2 align-items-start mb-3">
              <div><span className="cut-eyebrow">{editingArtistId ? "Editar participação" : "Adicionar artista"}</span><h2 className="h4 mb-1">{editingArtistId ? "Dados desta apresentação" : "Encontre a pessoa antes de criar o vínculo"}</h2><p className="text-secondary mb-0">Busque por @username, e-mail, telefone ou CPF. Os dados pessoais completos nunca são exibidos ao produtor.</p></div>
              {!editingArtistId && <div className="d-flex gap-2"><Button size="sm" variant={mode === "lookup" ? "light" : "outline-light"} onClick={() => { setMode("lookup"); setForm(emptySlot(artists.length)); }}>Localizar usuário</Button><Button size="sm" variant={mode === "managed" ? "light" : "outline-light"} onClick={() => { setMode("managed"); setForm(emptySlot(artists.length)); }}>Meus grupos/perfis</Button></div>}
            </div>

            {editingArtistId ? <Form onSubmit={saveEdit}>{slotFields}<div className="d-flex gap-2 mt-3"><Button type="submit" disabled={busy}>Salvar participação</Button><Button type="button" variant="outline-light" onClick={() => resetEditor()}>Cancelar</Button></div></Form> : mode === "lookup" ? (
              <Form onSubmit={saveLookup}>
                <Form.Group className="mb-3 position-relative">
                  <Form.Label>Usuário *</Form.Label>
                  <Form.Control value={query} onChange={(e) => setQuery(e.target.value)} placeholder="@usuario, email@exemplo.com, telefone ou CPF" autoComplete="off" />
                  {searching && <div className="small text-secondary mt-2"><Spinner size="sm" className="me-2" />Pesquisando...</div>}
                  {!!candidates.length && !selectedCandidate && <div className="cut-lineup-picker-results mt-2">{candidates.map((candidate) => <button type="button" key={candidate.id} className="cut-lineup-picker-item" onClick={() => selectCandidate(candidate)}><span className="cut-lineup-picker-avatar">{candidate.avatar ? <img src={candidate.avatar} alt="" /> : initials(candidate.name)}</span><span><strong>{candidate.name}</strong><small className="d-block">{candidate.username || "Sem username"}{candidate.city ? ` · ${candidate.city}${candidate.uf ? `/${candidate.uf}` : ""}` : ""}</small><small className="d-block text-secondary">{[candidate.email_hint, candidate.phone_hint].filter(Boolean).join(" · ")}</small></span>{candidate.artist && <Badge bg="success">Já é artista</Badge>}</button>)}</div>}
                  {selectedCandidate && <Alert variant="info" className="mt-2 mb-0"><strong>{selectedCandidate.name}</strong>{selectedCandidate.username ? ` · ${selectedCandidate.username}` : ""}{selectedCandidate.artist ? " · perfil artístico existente será reutilizado" : " · o perfil artístico será criado automaticamente"}</Alert>}
                  <Form.Text>Se a pessoa ainda não tiver conta, será criado somente um convite pendente — nunca um artista duplicado.</Form.Text>
                </Form.Group>
                {slotFields}
                <Button type="submit" className="mt-3" disabled={busy || query.trim().length < 2}>Adicionar ao evento</Button>
              </Form>
            ) : (
              <Form onSubmit={saveManaged}>
                <Form.Group className="mb-3"><Form.Label>Perfil que você administra *</Form.Label><Form.Select value={form.artist_id} onChange={(e) => setForm({ ...form, artist_id: e.target.value })}><option value="">Selecione...</option>{managedAvailable.map((artist) => <option key={artist.id} value={artist.id}>{artist.stage_name} · {artist.artist_type}</option>)}</Form.Select><Form.Text>Use esta opção para bandas, grupos ou perfis realmente administrados por você.</Form.Text></Form.Group>
                {slotFields}
                <Button type="submit" className="mt-3" disabled={busy || !form.artist_id}>Adicionar perfil</Button>
              </Form>
            )}
          </Card.Body>
        </Card>

        <div className="d-flex justify-content-between align-items-center mb-3"><div><span className="cut-eyebrow">Programação</span><h2 className="h4 mb-0">Line-up atual</h2></div><small className="text-secondary">{artists.length} atração(ões)</small></div>
        <div className="d-grid gap-3">
          {artists.map((artist, index) => {
            const pivot = artist.pivot || {};
            const status = pivot.status || "confirmed";
            const [statusLabel, statusColor] = STATUS_LABELS[status] || [status, "secondary"];
            return <Card key={artist.id} className="cut-lineup-artist-card"><Card.Body><div className="d-flex flex-wrap gap-3 justify-content-between align-items-start"><div className="d-flex gap-3 align-items-center"><div className="cut-lineup-picker-avatar">{artist.photo ? <img src={artist.photo} alt="" /> : initials(artist.stage_name)}</div><div><div className="d-flex flex-wrap gap-2 align-items-center"><h3 className="h5 mb-0">{artist.stage_name}</h3><Badge bg={statusColor}>{statusLabel}</Badge>{pivot.is_headliner && <Badge bg="info">Atração principal</Badge>}</div><div className="text-secondary small mt-1">{pivot.participation_type || "show"}{pivot.stage ? ` · ${pivot.stage}` : ""}{pivot.scheduled_at ? ` · ${new Date(pivot.scheduled_at).toLocaleString("pt-BR")}` : ""}</div>{pivot.checked_in_at && <small className="text-success d-block mt-1">Check-in confirmado</small>}</div></div><div className="d-flex flex-wrap gap-2"><Button size="sm" variant="outline-light" disabled={index === 0 || busy} onClick={() => move(artist.id, -1)}>↑</Button><Button size="sm" variant="outline-light" disabled={index === artists.length - 1 || busy} onClick={() => move(artist.id, 1)}>↓</Button><Button size="sm" variant="outline-light" onClick={() => beginEdit(artist)}>Editar participação</Button>{status === "confirmed" && !pivot.checked_in_at && <Button size="sm" variant="outline-success" onClick={() => checkIn(artist)}>Check-in</Button>}<Button size="sm" variant="outline-danger" onClick={() => removeArtist(artist)}>Remover</Button></div></div>{pivot.description && <p className="mb-0 mt-3 text-secondary">{pivot.description}</p>}</Card.Body></Card>;
          })}
          {!artists.length && !loading && <Card className="cut-lineup-artist-card"><Card.Body className="text-center py-5"><h3 className="h5">Nenhum artista no line-up</h3><p className="text-secondary mb-0">Localize o primeiro usuário acima para começar.</p></Card.Body></Card>}
        </div>
      </Container>
    </div>
  );
}
