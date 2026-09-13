import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import "./EventLineupPage.css";

const TYPES = ["atração principal", "show", "DJ set", "apresentação", "abertura", "participação especial", "convidado", "palestrante", "outra participação"];
const ARTIST_TYPES = [
  ["solo", "Artista solo"],
  ["band", "Banda"],
  ["duo", "Duo"],
  ["group", "Grupo"],
  ["collective", "Coletivo"],
  ["orchestra", "Orquestra"],
];
const TYPE_LABELS = { solo: "Solo", band: "Banda", duo: "Duo", group: "Grupo", collective: "Coletivo", orchestra: "Orquestra" };

const emptySlot = (sortOrder = 0) => ({
  artist_id: "",
  participation_type: "show",
  description: "",
  scheduled_at: "",
  stage: "",
  sort_order: sortOrder,
  is_headliner: false,
});

const toDateTimeLocal = (value) => value ? String(value).replace(" ", "T").slice(0, 16) : "";

const formatScheduledAt = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const errorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

export default function EventLineupPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const actionRef = useRef(false);
  const [event, setEvent] = useState(null);
  const [artists, setArtists] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState("existing");
  const [editingArtistId, setEditingArtistId] = useState(null);
  const [form, setForm] = useState(emptySlot());
  const [newArtist, setNewArtist] = useState({ stage_name: "", artist_type: "solo" });

  const load = async () => {
    const [eventData, lineup, owned] = await Promise.all([
      eventService.show(eventId),
      cutinappService.eventArtists(eventId),
      cutinappService.myArtists(),
    ]);
    if (!mountedRef.current) return;
    const nextArtists = lineup.artists || [];
    setEvent(eventData);
    setArtists(nextArtists);
    setMine(owned || []);
    setForm((current) => editingArtistId ? current : { ...current, sort_order: nextArtists.length });
  };

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    load()
      .catch((e) => mountedRef.current && setError(errorMessage(e, "Não foi possível carregar o line-up.")))
      .finally(() => mountedRef.current && setLoading(false));
    return () => { mountedRef.current = false; };
  }, [eventId]);

  const editingArtist = useMemo(
    () => artists.find((artist) => Number(artist.id) === Number(editingArtistId)) || null,
    [artists, editingArtistId],
  );

  const available = useMemo(
    () => mine.filter((artist) => editingArtistId || !artists.some((linked) => Number(linked.id) === Number(artist.id))),
    [mine, artists, editingArtistId],
  );

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

  const resetEditor = (nextArtists = artists) => {
    setEditingArtistId(null);
    setMode("existing");
    setForm(emptySlot(nextArtists.length));
    setNewArtist({ stage_name: "", artist_type: "solo" });
  };

  const attach = async (artistId, message) => {
    const response = await cutinappService.attachArtist(eventId, {
      ...form,
      artist_id: Number(artistId),
      sort_order: Number(form.sort_order || 0),
      scheduled_at: form.scheduled_at || null,
      stage: form.stage.trim() || null,
      description: form.description.trim() || null,
      is_headliner: Boolean(form.is_headliner),
    });
    const nextArtists = response.artists || [];
    if (!mountedRef.current) return;
    setArtists(nextArtists);
    setSuccess(message || response.message || "Line-up atualizado.");
    resetEditor(nextArtists);
  };

  const saveExisting = async (e) => {
    e.preventDefault();
    if (!form.artist_id || !beginAction()) return;
    try {
      await attach(
        form.artist_id,
        editingArtistId ? "Atração atualizada no line-up." : "Atração adicionada ao line-up.",
      );
    } catch (err) {
      if (mountedRef.current) setError(errorMessage(err, "Não foi possível salvar a atração."));
    } finally {
      endAction();
    }
  };

  const createAndAttach = async (e) => {
    e.preventDefault();
    const stageName = newArtist.stage_name.trim();
    if (stageName.length < 2 || !beginAction()) {
      if (stageName.length < 2) setError("Informe o nome artístico da atração.");
      return;
    }

    try {
      const created = await cutinappService.createArtist({
        stage_name: stageName,
        artist_type: newArtist.artist_type,
        is_published: true,
        claim_myself: false,
      });
      const artist = created?.artist;
      if (!artist?.id) throw new Error("A API não retornou o perfil artístico criado.");
      if (mountedRef.current) setMine((current) => [...current, artist]);
      await attach(artist.id, `${artist.stage_name} foi cadastrado e adicionado ao line-up.`);
    } catch (err) {
      if (mountedRef.current) setError(errorMessage(err, "Não foi possível cadastrar a nova atração."));
    } finally {
      endAction();
    }
  };

  const edit = (artist) => {
    const pivot = artist.pivot || {};
    setMode("existing");
    setEditingArtistId(artist.id);
    setForm({
      artist_id: String(artist.id),
      participation_type: pivot.participation_type || "show",
      description: pivot.description || "",
      scheduled_at: toDateTimeLocal(pivot.scheduled_at),
      stage: pivot.stage || "",
      sort_order: Number(pivot.sort_order || 0),
      is_headliner: Boolean(pivot.is_headliner),
    });
    setError("");
    setSuccess("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (artist) => {
    if (!beginAction()) return;
    try {
      await cutinappService.detachArtist(eventId, artist.id);
      const nextArtists = artists.filter((item) => Number(item.id) !== Number(artist.id));
      if (mountedRef.current) {
        setArtists(nextArtists);
        if (Number(editingArtistId) === Number(artist.id)) resetEditor(nextArtists);
        setSuccess(`${artist.stage_name} foi removido do line-up.`);
      }
    } catch (err) {
      if (mountedRef.current) setError(errorMessage(err, "Não foi possível remover a atração."));
    } finally {
      endAction();
    }
  };

  const setSlot = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const slotFields = (
    <>
      <Form.Group>
        <Form.Label>Participação *</Form.Label>
        <Form.Select value={form.participation_type} disabled={busy} onChange={(e) => setSlot("participation_type", e.target.value)}>
          {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </Form.Select>
      </Form.Group>
      <div className="cut-lineup-two-cols">
        <Form.Group>
          <Form.Label>Horário previsto</Form.Label>
          <Form.Control type="datetime-local" value={form.scheduled_at} disabled={busy} onChange={(e) => setSlot("scheduled_at", e.target.value)} />
        </Form.Group>
        <Form.Group>
          <Form.Label>Palco / espaço</Form.Label>
          <Form.Control value={form.stage} disabled={busy} placeholder="Ex.: Palco principal" onChange={(e) => setSlot("stage", e.target.value)} />
        </Form.Group>
      </div>
      <Form.Group>
        <Form.Label>Descrição da participação</Form.Label>
        <Form.Control as="textarea" rows={3} value={form.description} disabled={busy} placeholder="Ex.: DJ set de encerramento" onChange={(e) => setSlot("description", e.target.value)} />
      </Form.Group>
      <div className="cut-lineup-two-cols cut-lineup-order-row">
        <Form.Group>
          <Form.Label>Ordem no line-up</Form.Label>
          <Form.Control type="number" min="0" max="1000" value={form.sort_order} disabled={busy} onChange={(e) => setSlot("sort_order", e.target.value)} />
        </Form.Group>
        <Form.Check
          type="switch"
          label="Atração principal"
          checked={form.is_headliner}
          disabled={busy}
          onChange={(e) => setSlot("is_headliner", e.target.checked)}
        />
      </div>
    </>
  );

  const headliners = artists.filter((artist) => Boolean(artist.pivot?.is_headliner)).length;

  return (
    <div className="cut-app-page cut-lineup-page">
      <NavlogComponent />
      {(loading || busy) && <ProcessingIndicatorComponent label={loading ? "Carregando line-up" : "Atualizando line-up"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-lineup-hero">
          <div>
            <span className="cut-eyebrow">Line-up do evento</span>
            <h1>{event?.title || "Atrações do evento"}</h1>
            <p>Cadastre artistas, DJs, bandas, convidados e horários sem sair da gestão do evento. O line-up aparece automaticamente na página pública.</p>
          </div>
          <div className="cut-lineup-hero-actions">
            <Button variant="outline-light" onClick={() => navigate(`/event/edit/${eventId}`)}>
              <i className="fa-solid fa-arrow-left me-2" />Voltar ao evento
            </Button>
            {event?.slug && event?.is_published && (
              <Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}>
                <i className="fa-solid fa-arrow-up-right-from-square me-2" />Ver página pública
              </Button>
            )}
          </div>
        </div>

        <div className="cut-lineup-summary">
          <div><strong>{artists.length}</strong><span>Atrações</span></div>
          <div><strong>{headliners}</strong><span>Destaques</span></div>
          <div><strong>{artists.filter((artist) => artist.pivot?.scheduled_at).length}</strong><span>Com horário</span></div>
        </div>

        {error && <Alert variant="danger" role="alert" aria-live="assertive">{error}</Alert>}
        {success && <Alert variant="success" role="status" aria-live="polite">{success}</Alert>}

        <Row className="g-4 align-items-start">
          <Col lg={5}>
            <Card className="cut-panel cut-lineup-editor-card">
              <Card.Body className="p-4">
                <div className="cut-lineup-editor-heading">
                  <div>
                    <span className="cut-eyebrow">{editingArtistId ? "Editando atração" : "Adicionar ao line-up"}</span>
                    <h2 className="cut-section-title">{editingArtist?.stage_name || "Nova atração"}</h2>
                  </div>
                  {editingArtistId && <Button size="sm" variant="outline-light" onClick={() => resetEditor()} disabled={busy}>Cancelar</Button>}
                </div>

                {!editingArtistId && (
                  <div className="cut-lineup-mode-switch" role="tablist" aria-label="Forma de adicionar atração">
                    <button type="button" className={mode === "existing" ? "is-active" : ""} onClick={() => setMode("existing")}>
                      <i className="fa-solid fa-user-check" />Perfil existente
                    </button>
                    <button type="button" className={mode === "new" ? "is-active" : ""} onClick={() => setMode("new")}>
                      <i className="fa-solid fa-user-plus" />Cadastrar atração
                    </button>
                  </div>
                )}

                {(mode === "existing" || editingArtistId) ? (
                  <Form onSubmit={saveExisting} className="cut-lineup-form" aria-busy={busy}>
                    <Form.Group>
                      <Form.Label>Artista / formação *</Form.Label>
                      <Form.Select
                        required
                        value={form.artist_id}
                        disabled={busy || Boolean(editingArtistId)}
                        onChange={(e) => setSlot("artist_id", e.target.value)}
                      >
                        <option value="">Selecione</option>
                        {editingArtist && !mine.some((artist) => Number(artist.id) === Number(editingArtist.id)) && (
                          <option value={editingArtist.id}>{editingArtist.stage_name} · {TYPE_LABELS[editingArtist.artist_type] || "Artista"}</option>
                        )}
                        {available.map((artist) => (
                          <option key={artist.id} value={artist.id}>{artist.stage_name} · {TYPE_LABELS[artist.artist_type] || "Artista"}</option>
                        ))}
                      </Form.Select>
                      {!editingArtistId && available.length === 0 && (
                        <Form.Text className="text-secondary">
                          Nenhum perfil disponível. Use “Cadastrar atração” para criar o nome diretamente neste evento.
                        </Form.Text>
                      )}
                    </Form.Group>
                    {slotFields}
                    <Button type="submit" disabled={busy || !form.artist_id} className="w-100">
                      <i className={`${editingArtistId ? "fa-solid fa-floppy-disk" : "fa-solid fa-plus"} me-2`} />
                      {editingArtistId ? "Salvar alterações" : "Adicionar ao line-up"}
                    </Button>
                  </Form>
                ) : (
                  <Form onSubmit={createAndAttach} className="cut-lineup-form" aria-busy={busy}>
                    <div className="cut-lineup-two-cols">
                      <Form.Group>
                        <Form.Label>Nome artístico *</Form.Label>
                        <Form.Control
                          required
                          minLength={2}
                          maxLength={255}
                          value={newArtist.stage_name}
                          disabled={busy}
                          placeholder="Ex.: DJ Marco Roger"
                          onChange={(e) => setNewArtist((current) => ({ ...current, stage_name: e.target.value }))}
                        />
                      </Form.Group>
                      <Form.Group>
                        <Form.Label>Tipo *</Form.Label>
                        <Form.Select
                          value={newArtist.artist_type}
                          disabled={busy}
                          onChange={(e) => setNewArtist((current) => ({ ...current, artist_type: e.target.value }))}
                        >
                          {ARTIST_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </Form.Select>
                      </Form.Group>
                    </div>
                    <div className="cut-lineup-info">
                      <i className="fa-solid fa-circle-info" />
                      <span>Será criado um perfil provisório público. O próprio artista poderá reivindicar esse perfil depois.</span>
                    </div>
                    {slotFields}
                    <Button type="submit" disabled={busy || newArtist.stage_name.trim().length < 2} className="w-100">
                      <i className="fa-solid fa-wand-magic-sparkles me-2" />Cadastrar e adicionar
                    </Button>
                  </Form>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={7}>
            <div className="cut-section-heading cut-lineup-list-heading">
              <div>
                <span className="cut-eyebrow">Escalação atual</span>
                <h2>{artists.length ? `${artists.length} atração(ões) cadastrada(s)` : "Line-up ainda vazio"}</h2>
              </div>
            </div>

            {artists.length === 0 ? (
              <Card className="cut-empty-state cut-lineup-empty">
                <Card.Body>
                  <i className="fa-solid fa-music" />
                  <h3>Comece o line-up</h3>
                  <p>Cadastre a primeira atração ao lado. Horário, palco e destaque podem ser ajustados depois.</p>
                </Card.Body>
              </Card>
            ) : (
              <div className="cut-lineup-list" aria-busy={busy}>
                {artists.map((artist, index) => (
                  <Card className={`cut-panel cut-lineup-item ${artist.pivot?.is_headliner ? "is-headliner" : ""}`} key={artist.id}>
                    <Card.Body className="p-3 p-md-4">
                      <div className="cut-lineup-item-main">
                        <div className="cut-lineup-index">{String(index + 1).padStart(2, "0")}</div>
                        <div className="cut-lineup-item-copy">
                          <div className="cut-lineup-item-title">
                            <strong>{artist.stage_name}</strong>
                            <Badge bg="secondary">{TYPE_LABELS[artist.artist_type] || "Artista"}</Badge>
                            {artist.pivot?.is_headliner && <Badge bg="warning" text="dark">Atração principal</Badge>}
                          </div>
                          <div className="cut-lineup-meta">
                            <span><i className="fa-solid fa-microphone-lines" />{artist.pivot?.participation_type || "Participação"}</span>
                            {artist.pivot?.scheduled_at && <span><i className="fa-regular fa-clock" />{formatScheduledAt(artist.pivot.scheduled_at)}</span>}
                            {artist.pivot?.stage && <span><i className="fa-solid fa-location-dot" />{artist.pivot.stage}</span>}
                          </div>
                          {artist.pivot?.description && <p>{artist.pivot.description}</p>}
                        </div>
                      </div>
                      <div className="cut-lineup-item-actions">
                        <Button variant="outline-light" size="sm" disabled={busy} onClick={() => edit(artist)}>
                          <i className="fa-solid fa-pen me-2" />Editar
                        </Button>
                        <Button variant="outline-danger" size="sm" disabled={busy} onClick={() => remove(artist)}>
                          <i className="fa-solid fa-trash me-2" />Remover
                        </Button>
                      </div>
                    </Card.Body>
                  </Card>
                ))}
              </div>
            )}
          </Col>
        </Row>
      </Container>
    </div>
  );
}
