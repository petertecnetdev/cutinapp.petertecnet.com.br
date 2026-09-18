import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import aiContentService from "../../services/AiContentService";
import artistService from "../../services/ArtistService";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";
import "./EventLineupPage.css";

const TYPES = ["atração principal", "show", "DJ set", "apresentação", "abertura", "participação especial", "convidado", "palestrante", "outra participação"];
const STATUS_LABELS = {
  pending: ["Aguardando resposta", "warning"],
  pending_external: ["Aguardando cadastro", "info"],
  pending_change: ["Nova confirmação necessária", "warning"],
  confirmed: ["Confirmado", "success"],
  accepted: ["Confirmado", "success"],
  declined: ["Recusado", "secondary"],
  expired: ["Expirado", "secondary"],
  cancelled: ["Cancelado", "danger"],
  cancelled_by_producer: ["Cancelado pela produção", "danger"],
  event_cancelled: ["Evento cancelado", "danger"],
};
const EMAIL_STATUS_LABELS = {
  not_sent: ["E-mail ainda não enviado", "secondary"],
  sent: ["E-mail enviado", "info"],
  delivered: ["E-mail entregue", "success"],
  opened: ["E-mail aberto", "success"],
  bounced: ["E-mail devolvido", "danger"],
  failed: ["Falha no e-mail", "danger"],
};
const ACTIVE_INVITATION_STATUSES = new Set(["pending", "pending_external", "pending_change"]);

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
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
const avatarSrc = (value) => {
  if (!value) return "";
  const avatar = String(value);
  return /^https?:\/\//i.test(avatar) ? avatar : `${storageUrl}${avatar.replace(/^\/+/, "")}`;
};

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
  const [invitationOverview, setInvitationOverview] = useState({ invitations: [], counts: {}, metrics: {} });
  const [statusFilter, setStatusFilter] = useState("active");
  const [editingInviteEmailId, setEditingInviteEmailId] = useState(null);
  const [editedInviteEmail, setEditedInviteEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchCompleted, setSearchCompleted] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState("lookup");
  const [query, setQuery] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [editingArtistId, setEditingArtistId] = useState(null);
  const [form, setForm] = useState(emptySlot());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [eventData, lineup, owned, invites] = await Promise.all([
        eventService.show(eventId),
        cutinappService.eventArtists(eventId),
        cutinappService.myArtists(),
        artistService.eventInvitations(eventId).catch(() => ({ invitations: [], counts: {}, metrics: {} })),
      ]);
      const next = lineup?.artists || [];
      setEvent(eventData);
      setArtists(next);
      setMine(Array.isArray(owned) ? owned : []);
      setInvitationOverview({
        invitations: Array.isArray(invites?.invitations) ? invites.invitations : [],
        counts: invites?.counts || {},
        metrics: invites?.metrics || {},
      });
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
    if (selectedCandidate) {
      setSearching(false);
      setSearchCompleted(false);
      setSearchFailed(false);
      setCandidates([]);
      return undefined;
    }

    const value = query.trim();
    setSearchCompleted(false);
    setSearchFailed(false);
    if (value.length < 2) {
      setCandidates([]);
      setInviteEmail("");
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await artistService.searchCandidates(eventId, value);
        setCandidates(found);
        setSearchCompleted(true);
        if (!found.length && isEmail(value)) setInviteEmail(value.toLowerCase());
      } catch (err) {
        setCandidates([]);
        setSearchFailed(true);
        setSearchCompleted(true);
        if (err?.response?.status !== 422) setError(errorMessage(err, "Não foi possível pesquisar usuários."));
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [eventId, mode, query, selectedCandidate]);

  const invitationRows = useMemo(
    () => Array.isArray(invitationOverview?.invitations) ? invitationOverview.invitations : [],
    [invitationOverview],
  );
  const invitationByArtist = useMemo(() => new Map(
    invitationRows.filter((row) => row.artist_id).map((row) => [Number(row.artist_id), row]),
  ), [invitationRows]);
  const managedAvailable = useMemo(() => mine.filter((artist) => !artists.some((item) => Number(item.id) === Number(artist.id))), [artists, mine]);
  const confirmed = useMemo(() => artists.filter((artist) => (artist.pivot?.status || "confirmed") === "confirmed").length, [artists]);
  const pending = useMemo(() => invitationRows.filter((row) => ACTIVE_INVITATION_STATUSES.has(row.status)).length, [invitationRows]);
  const declined = useMemo(() => invitationRows.filter((row) => row.status === "declined").length, [invitationRows]);
  const closed = useMemo(() => invitationRows.filter((row) => ["expired", "cancelled_by_producer", "event_cancelled"].includes(row.status)).length, [invitationRows]);
  const filteredArtists = useMemo(() => artists.filter((artist) => {
    const status = artist.pivot?.status || "confirmed";
    if (statusFilter === "all") return true;
    if (statusFilter === "confirmed") return status === "confirmed";
    if (statusFilter === "pending") return ["pending", "pending_change"].includes(status);
    if (statusFilter === "declined") return status === "declined";
    if (statusFilter === "closed") return ["expired", "cancelled_by_producer", "event_cancelled", "cancelled"].includes(status);
    return !["expired", "cancelled_by_producer", "event_cancelled", "cancelled"].includes(status);
  }), [artists, statusFilter]);
  const externalInvitations = useMemo(() => invitationRows.filter((row) => !row.artist_id), [invitationRows]);
  const noCandidateFound = mode === "lookup"
    && query.trim().length >= 2
    && searchCompleted
    && !searching
    && !searchFailed
    && !selectedCandidate
    && candidates.length === 0;
  const canSubmitLookup = Boolean(selectedCandidate) || (noCandidateFound && isEmail(inviteEmail));

  const resetEditor = (nextArtists = artists) => {
    setEditingArtistId(null);
    setSelectedCandidate(null);
    setQuery("");
    setInviteEmail("");
    setCandidates([]);
    setSearchCompleted(false);
    setSearchFailed(false);
    setForm(emptySlot(nextArtists.length));
    setMode("lookup");
  };

  const selectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setQuery(candidate.username || candidate.name || query);
    setInviteEmail("");
    setCandidates([]);
    setSearchCompleted(false);
    setSearchFailed(false);
  };

  const changeQuery = (value) => {
    setQuery(value);
    setSelectedCandidate(null);
    setCandidates([]);
    setSearchCompleted(false);
    setSearchFailed(false);
    setInviteEmail(isEmail(value) ? value.trim().toLowerCase() : "");
  };

  const saveLookup = async (e) => {
    e.preventDefault();

    let identifier = "";
    if (selectedCandidate) {
      identifier = String(selectedCandidate.username || query || "").trim();
    } else if (noCandidateFound) {
      identifier = String(inviteEmail || "").trim().toLowerCase();
      if (!isEmail(identifier)) {
        setError("Informe um e-mail válido para enviarmos o convite de cadastro.");
        return;
      }
    } else {
      setError("Localize e selecione o usuário antes de adicionar ao evento.");
      return;
    }

    if (identifier.length < 2) {
      setError("Informe o @username, e-mail, telefone ou CPF do usuário.");
      return;
    }

    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await artistService.resolveAndInvite(eventId, { identifier, ...participationPayload(form) });
      if (response.external_invitation) {
        setSuccess(response.message || "A pessoa ainda não possui conta. O convite de cadastro foi enviado por e-mail.");
        await load();
        resetEditor();
      } else {
        setSuccess(response.message || "Artista localizado e convidado para o evento.");
        await load();
        resetEditor();
      }
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
      setSuccess(response?.message || "Participação atualizada sem alterar o perfil pessoal do artista.");
      await load();
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
      setSuccess(`${artist.stage_name} foi cancelado no line-up. O histórico foi preservado.`);
      if (Number(editingArtistId) === Number(artist.id)) resetEditor();
      await load();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível remover o artista."));
    } finally {
      setBusy(false);
    }
  };

  const resendInvitation = async (invitation) => {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await artistService.resendInvitation(eventId, invitation.id);
      setSuccess(response?.message || "Convite reenviado.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível reenviar o convite."));
    } finally {
      setBusy(false);
    }
  };

  const cancelInvitation = async (invitation, label = "este convite") => {
    const reason = window.prompt(`Motivo do cancelamento de ${label} (opcional):`, "") ?? null;
    if (reason === null) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await artistService.cancelInvitation(eventId, invitation.id, reason);
      setSuccess(response?.message || "Convite cancelado.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível cancelar o convite."));
    } finally {
      setBusy(false);
    }
  };

  const saveInvitationEmail = async (invitation) => {
    const email = String(editedInviteEmail || "").trim().toLowerCase();
    if (!isEmail(email)) {
      setError("Informe um e-mail válido.");
      return;
    }
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await artistService.updateInvitationEmail(eventId, invitation.id, email);
      setSuccess(response?.message || "E-mail corrigido.");
      setEditingInviteEmailId(null);
      setEditedInviteEmail("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível corrigir o e-mail do convite."));
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
          <div><span className="cut-eyebrow">Line-up do evento</span><h1>{event?.title || "Atrações do evento"}</h1><p>O artista é uma identidade própria da Cutinapp. Ao apresentar um novo artista, a produção pode virar uma referência de origem, mas gerencia somente a participação neste evento.</p></div>
          <div className="cut-lineup-hero-actions"><Button variant="outline-light" onClick={() => navigate(`/event/edit/${eventId}`)}>Voltar ao evento</Button></div>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

        <Row className="g-3 mb-4">
          <Col sm={6} lg><Card className="cut-lineup-summary-card h-100"><Card.Body><small>Convites</small><strong className="d-block fs-3">{invitationRows.length}</strong></Card.Body></Card></Col>
          <Col sm={6} lg><Card className="cut-lineup-summary-card h-100"><Card.Body><small>Confirmados</small><strong className="d-block fs-3">{confirmed}</strong></Card.Body></Card></Col>
          <Col sm={6} lg><Card className="cut-lineup-summary-card h-100"><Card.Body><small>Aguardando resposta</small><strong className="d-block fs-3">{pending}</strong></Card.Body></Card></Col>
          <Col sm={6} lg><Card className="cut-lineup-summary-card h-100"><Card.Body><small>Recusados</small><strong className="d-block fs-3">{declined}</strong></Card.Body></Card></Col>
          <Col sm={6} lg><Card className="cut-lineup-summary-card h-100"><Card.Body><small>Encerrados</small><strong className="d-block fs-3">{closed}</strong></Card.Body></Card></Col>
        </Row>

        {invitationRows.length > 0 && <Card className="cut-lineup-editor-card mb-4"><Card.Body>
          <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div><span className="cut-eyebrow">Conversão dos convites</span><h2 className="h5 mb-1">Resposta dos artistas</h2><p className="text-secondary mb-0">A presença só entra como confirmada depois do aceite explícito do artista ou gestor autorizado.</p></div>
            <div className="cut-lineup-invite-metrics">
              <span><strong>{Number(invitationOverview?.metrics?.acceptance_rate || 0)}%</strong> aceite</span>
              <span><strong>{Number(invitationOverview?.metrics?.view_rate || 0)}%</strong> visualização</span>
              <span><strong>{invitationOverview?.metrics?.average_response_minutes == null ? "—" : `${invitationOverview.metrics.average_response_minutes} min`}</strong> resposta média</span>
            </div>
          </div>
        </Card.Body></Card>}

        <Card className="cut-lineup-editor-card mb-4">
          <Card.Body>
            <div className="d-flex flex-wrap justify-content-between gap-2 align-items-start mb-3">
              <div><span className="cut-eyebrow">{editingArtistId ? "Editar participação" : "Adicionar artista"}</span><h2 className="h4 mb-1">{editingArtistId ? "Dados desta apresentação" : "Encontre a pessoa antes de criar o vínculo"}</h2><p className="text-secondary mb-0">Busque por @username, e-mail, telefone ou CPF. Se ainda não existir conta, pediremos o e-mail para enviar o convite de cadastro.</p></div>
              {!editingArtistId && <div className="d-flex gap-2"><Button size="sm" variant={mode === "lookup" ? "light" : "outline-light"} onClick={() => { setMode("lookup"); setForm(emptySlot(artists.length)); }}>Localizar usuário</Button><Button size="sm" variant={mode === "managed" ? "light" : "outline-light"} onClick={() => { setMode("managed"); setForm(emptySlot(artists.length)); }}>Meus grupos/perfis</Button></div>}
            </div>

            {editingArtistId ? <Form onSubmit={saveEdit}>{slotFields}<div className="d-flex gap-2 mt-3"><Button type="submit" disabled={busy}>Salvar participação</Button><Button type="button" variant="outline-light" onClick={() => resetEditor()}>Cancelar</Button></div></Form> : mode === "lookup" ? (
              <Form onSubmit={saveLookup}>
                <Form.Group className="mb-3 position-relative">
                  <Form.Label>Localizar usuário *</Form.Label>
                  <Form.Control value={query} onChange={(e) => changeQuery(e.target.value)} placeholder="@usuario, email@exemplo.com, telefone ou CPF" autoComplete="off" />
                  {searching && <div className="small text-secondary mt-2"><Spinner size="sm" className="me-2" />Pesquisando...</div>}
                  {!!candidates.length && !selectedCandidate && <div className="cut-lineup-picker-results mt-2">{candidates.map((candidate) => <button type="button" key={candidate.id} className="cut-lineup-picker-item" onClick={() => selectCandidate(candidate)}><span className="cut-lineup-picker-avatar">{candidate.avatar ? <img src={avatarSrc(candidate.avatar)} alt="" loading="lazy" /> : initials(candidate.name)}</span><span><strong>{candidate.name}</strong><small className="d-block">{candidate.username || "Sem username"}{candidate.city ? ` · ${candidate.city}${candidate.uf ? `/${candidate.uf}` : ""}` : ""}</small><small className="d-block text-secondary">{[candidate.email_hint, candidate.phone_hint].filter(Boolean).join(" · ")}</small><span className="cut-lineup-candidate-type"><i className={candidate.artist ? "fa-solid fa-music" : "fa-regular fa-user"} />{candidate.artist ? "Artista da Cutinapp" : "Usuário — identidade artística será criada ao vincular"}</span></span>{candidate.already_in_event ? <Badge bg="warning" text="dark">Já no evento</Badge> : candidate.artist ? <Badge bg="success">Artista</Badge> : <Badge bg="secondary">Usuário</Badge>}</button>)}</div>}
                  {selectedCandidate && <Alert variant={selectedCandidate.already_in_event ? "warning" : "info"} className="mt-2 mb-0"><strong>{selectedCandidate.name}</strong>{selectedCandidate.username ? ` · ${selectedCandidate.username}` : ""}{selectedCandidate.already_in_event ? " · este artista já participa do evento; salvar atualizará os dados da participação." : selectedCandidate.artist ? " · perfil artístico existente será reutilizado." : " · a identidade artística será criada automaticamente. Esta produção ficará registrada como referência de origem, mas não ganhará controle do perfil."}</Alert>}
                  {noCandidateFound && <Alert variant="warning" className="mt-3 mb-0"><strong>Nenhuma conta encontrada.</strong><div className="mt-2 mb-2">Informe o e-mail da pessoa. A Cutinapp enviará um convite para ela criar a conta e, após a confirmação do e-mail, o vínculo com este evento será recuperado automaticamente.</div><Form.Label htmlFor="artist-invite-email">E-mail para convite *</Form.Label><Form.Control id="artist-invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="artista@exemplo.com" autoComplete="email" /><Form.Text>Nenhum perfil artístico é criado antes de a pessoa possuir uma conta válida.</Form.Text></Alert>}
                  <Form.Text>Os dados pessoais completos nunca são exibidos ao produtor.</Form.Text>
                </Form.Group>
                {slotFields}
                <Button type="submit" className="mt-3" disabled={busy || !canSubmitLookup}>{noCandidateFound ? "Enviar convite e adicionar ao evento" : "Adicionar ao evento"}</Button>
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

        {externalInvitations.length > 0 && <section className="mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3"><div><span className="cut-eyebrow">Aguardando cadastro</span><h2 className="h4 mb-0">Convites externos</h2></div><small className="text-secondary">{externalInvitations.length} convite(s)</small></div>
          <div className="d-grid gap-3">
            {externalInvitations.map((invitation) => {
              const [statusLabel, statusColor] = STATUS_LABELS[invitation.status] || [invitation.status, "secondary"];
              const [emailLabel, emailColor] = EMAIL_STATUS_LABELS[invitation.email_status] || [invitation.email_status || "E-mail", "secondary"];
              const activeInvite = ACTIVE_INVITATION_STATUSES.has(invitation.status);
              const cooldown = invitation.resend_available_at && new Date(invitation.resend_available_at).getTime() > Date.now();
              return <Card key={invitation.id} className="cut-lineup-artist-card"><Card.Body>
                <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                  <div>
                    <div className="d-flex flex-wrap gap-2 align-items-center"><h3 className="h5 mb-0">{invitation.identifier_hint || "Novo artista"}</h3><Badge bg={statusColor}>{statusLabel}</Badge><Badge bg={emailColor}>{emailLabel}</Badge></div>
                    <small className="text-secondary d-block mt-1">A identidade artística será criada somente quando a pessoa concluir o cadastro com o mesmo e-mail. Depois disso, o convite continuará aguardando aceite.</small>
                    {invitation.email_status === "failed" || invitation.email_status === "bounced" ? <Alert variant="danger" className="mt-2 mb-0 py-2">O convite existe, mas o e-mail não chegou corretamente. Corrija o endereço ou tente reenviar.</Alert> : null}
                  </div>
                  {activeInvite && <div className="d-flex flex-wrap gap-2">
                    <Button size="sm" variant="outline-light" disabled={busy || cooldown} onClick={() => resendInvitation(invitation)}>{cooldown ? "Aguarde para reenviar" : "Reenviar"}</Button>
                    {invitation.status === "pending_external" && <Button size="sm" variant="outline-light" onClick={() => { setEditingInviteEmailId(invitation.id); setEditedInviteEmail(""); }}>Corrigir e-mail</Button>}
                    <Button size="sm" variant="outline-danger" onClick={() => cancelInvitation(invitation, invitation.identifier_hint || "convite")}>Cancelar convite</Button>
                  </div>}
                </div>
                {editingInviteEmailId === invitation.id && <div className="cut-lineup-email-editor mt-3"><Form.Control type="email" value={editedInviteEmail} onChange={(e) => setEditedInviteEmail(e.target.value)} placeholder="novo-email@exemplo.com" /><Button size="sm" disabled={busy || !isEmail(editedInviteEmail)} onClick={() => saveInvitationEmail(invitation)}>Salvar e reenviar</Button><Button size="sm" variant="outline-light" onClick={() => { setEditingInviteEmailId(null); setEditedInviteEmail(""); }}>Fechar</Button></div>}
              </Card.Body></Card>;
            })}
          </div>
        </section>}

        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
          <div><span className="cut-eyebrow">Programação</span><h2 className="h4 mb-0">Line-up e histórico</h2></div>
          <div className="d-flex gap-2 align-items-center flex-wrap">
            <Form.Select size="sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtrar line-up por status">
              <option value="active">Ativos</option>
              <option value="all">Todos</option>
              <option value="confirmed">Confirmados</option>
              <option value="pending">Aguardando resposta</option>
              <option value="declined">Recusados</option>
              <option value="closed">Cancelados/expirados</option>
            </Form.Select>
            <small className="text-secondary">{filteredArtists.length} atração(ões)</small>
          </div>
        </div>
        <div className="d-grid gap-3">
          {filteredArtists.map((artist, index) => {
            const pivot = artist.pivot || {};
            const status = pivot.status || "confirmed";
            const [statusLabel, statusColor] = STATUS_LABELS[status] || [status, "secondary"];
            const invitation = invitationByArtist.get(Number(artist.id));
            const [emailLabel, emailColor] = EMAIL_STATUS_LABELS[invitation?.email_status] || [invitation?.email_status || "", "secondary"];
            const activeInvite = invitation && ACTIVE_INVITATION_STATUSES.has(invitation.status);
            const cooldown = invitation?.resend_available_at && new Date(invitation.resend_available_at).getTime() > Date.now();
            return <Card key={artist.id} className="cut-lineup-artist-card"><Card.Body><div className="d-flex flex-wrap gap-3 justify-content-between align-items-start"><div className="d-flex gap-3 align-items-center"><div className="cut-lineup-picker-avatar">{artist.photo ? <img src={avatarSrc(artist.photo)} alt="" loading="lazy" /> : initials(artist.stage_name)}</div><div><div className="d-flex flex-wrap gap-2 align-items-center"><h3 className="h5 mb-0">{artist.stage_name}</h3><Badge bg={statusColor}>{statusLabel}</Badge>{invitation?.email_status && <Badge bg={emailColor}>{emailLabel}</Badge>}{pivot.is_headliner && <Badge bg="info">Atração principal</Badge>}</div><div className="text-secondary small mt-1">{pivot.participation_type || "show"}{pivot.stage ? ` · ${pivot.stage}` : ""}{pivot.scheduled_at ? ` · ${new Date(pivot.scheduled_at).toLocaleString("pt-BR")}` : ""}</div>{pivot.decline_reason && <small className="text-secondary d-block mt-1">Motivo informado: {pivot.decline_reason}</small>}{pivot.checked_in_at && <small className="text-success d-block mt-1">Check-in confirmado</small>}{invitation && (invitation.email_status === "failed" || invitation.email_status === "bounced") && <small className="text-danger d-block mt-1">Falha na entrega do e-mail. O convite continua pendente.</small>}</div></div><div className="d-flex flex-wrap gap-2"><Button size="sm" variant="outline-light" disabled={index === 0 || busy || statusFilter !== "active"} onClick={() => move(artist.id, -1)}>↑</Button><Button size="sm" variant="outline-light" disabled={index === filteredArtists.length - 1 || busy || statusFilter !== "active"} onClick={() => move(artist.id, 1)}>↓</Button><Button size="sm" variant="outline-light" onClick={() => beginEdit(artist)} disabled={["cancelled_by_producer","event_cancelled","expired"].includes(status)}>Editar participação</Button>{activeInvite && <Button size="sm" variant="outline-light" disabled={busy || cooldown} onClick={() => resendInvitation(invitation)}>{cooldown ? "Reenvio em breve" : "Reenviar convite"}</Button>}{status === "confirmed" && !pivot.checked_in_at && <Button size="sm" variant="outline-success" onClick={() => checkIn(artist)}>Check-in</Button>}{!["cancelled_by_producer","event_cancelled","expired"].includes(status) && <Button size="sm" variant="outline-danger" onClick={() => invitation ? cancelInvitation(invitation, artist.stage_name) : removeArtist(artist)}>Cancelar</Button>}</div></div>{pivot.description && <p className="mb-0 mt-3 text-secondary">{pivot.description}</p>}</Card.Body></Card>;
          })}
          {!filteredArtists.length && !loading && <Card className="cut-lineup-artist-card"><Card.Body className="text-center py-5"><h3 className="h5">Nenhum artista no line-up</h3><p className="text-secondary mb-0">Localize o primeiro usuário acima para começar.</p></Card.Body></Card>}
        </div>
      </Container>
    </div>
  );
}
