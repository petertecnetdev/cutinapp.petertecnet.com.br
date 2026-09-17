import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import aiContentService from "../../services/AiContentService";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import { trackTelemetry } from "../../utils/telemetry";
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
const DRAFT_PREFIX = "cutinapp:lineup-draft:v2:";
const PREFS_KEY = "cutinapp:lineup-preferences:v1";
const TEMPLATES_KEY = "cutinapp:lineup-templates:v1";

const readJson = (storageName, key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window[storageName]?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
};

const writeJson = (storageName, key, value) => {
  if (typeof window === "undefined") return false;
  try {
    window[storageName]?.setItem(key, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
};

const removeStored = (storageName, key) => {
  try {
    if (typeof window !== "undefined") window[storageName]?.removeItem(key);
  } catch (_) {
    // Storage is a progressive enhancement only.
  }
};

const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

const eventDatePrefix = (event) => {
  const candidates = [event?.starts_at, event?.start_at, event?.date, event?.event_date, event?.scheduled_at];
  for (const candidate of candidates) {
    const match = String(candidate || "").match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  return "";
};

const toDateTimeLocal = (value) => value ? String(value).replace(" ", "T").slice(0, 16) : "";

const adaptScheduleToEvent = (value, event) => {
  if (!value) return "";
  const targetDate = eventDatePrefix(event);
  const normalized = toDateTimeLocal(value);
  if (!targetDate) return normalized;
  const time = normalized.match(/T(\d{2}:\d{2})/)?.[1];
  return time ? `${targetDate}T${time}` : normalized;
};

const formatScheduledAt = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const errorMessage = (error, fallback) => error?.response?.data?.message || error?.message || fallback;

const buildSlot = (sortOrder = 0, defaults = {}) => ({
  artist_id: "",
  participation_type: defaults.participation_type || "show",
  description: "",
  scheduled_at: defaults.scheduled_at || "",
  stage: defaults.stage || "",
  sort_order: sortOrder,
  is_headliner: false,
});

const pivotPayload = (artist, overrides = {}) => {
  const pivot = { ...(artist?.pivot || {}), ...overrides };
  return {
    artist_id: Number(artist.id),
    participation_type: pivot.participation_type || "show",
    description: String(pivot.description || "").trim() || null,
    scheduled_at: pivot.scheduled_at ? toDateTimeLocal(pivot.scheduled_at) : null,
    stage: String(pivot.stage || "").trim() || null,
    sort_order: Number(pivot.sort_order || 0),
    is_headliner: Boolean(pivot.is_headliner),
  };
};

const formPayload = (artistId, slot) => ({
  artist_id: Number(artistId),
  participation_type: slot.participation_type || "show",
  description: String(slot.description || "").trim() || null,
  scheduled_at: slot.scheduled_at || null,
  stage: String(slot.stage || "").trim() || null,
  sort_order: Number(slot.sort_order || 0),
  is_headliner: Boolean(slot.is_headliner),
});

const artistCompletion = (artist) => {
  const pivot = artist?.pivot || {};
  const checks = [pivot.participation_type, pivot.scheduled_at, pivot.stage];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
};

const nextSuggestedSchedule = (artists, event) => {
  const scheduled = artists
    .map((artist) => artist?.pivot?.scheduled_at)
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  if (scheduled.length) {
    const next = new Date(scheduled[0].getTime() + 60 * 60 * 1000);
    const local = new Date(next.getTime() - next.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    return adaptScheduleToEvent(local, event);
  }

  const prefix = eventDatePrefix(event);
  return prefix ? `${prefix}T20:00` : "";
};

const avatarSource = (artist) => artist?.photo_url || artist?.avatar_url || artist?.image_url || artist?.cover_url || "";

export default function EventLineupPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const mountedRef = useRef(true);
  const editorRef = useRef(null);
  const artistSearchRef = useRef(null);
  const openedAtRef = useRef(Date.now());
  const dirtyRef = useRef(false);
  const prefsRef = useRef(readJson("localStorage", PREFS_KEY, {}));

  const [event, setEvent] = useState(null);
  const [artists, setArtists] = useState([]);
  const [mine, setMine] = useState([]);
  const [sourceEvents, setSourceEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingArtistId, setSavingArtistId] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [copying, setCopying] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mode, setMode] = useState("existing");
  const [editingArtistId, setEditingArtistId] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [form, setForm] = useState(() => buildSlot(0, prefsRef.current));
  const [newArtist, setNewArtist] = useState({ stage_name: "", artist_type: "solo" });
  const [artistQuery, setArtistQuery] = useState("");
  const [artistPickerOpen, setArtistPickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState("cards");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState("mobile");
  const [dragArtistId, setDragArtistId] = useState(null);
  const [undo, setUndo] = useState(null);
  const [sourceEventId, setSourceEventId] = useState("");
  const [templates, setTemplates] = useState(() => readJson("localStorage", TEMPLATES_KEY, []));
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const draftKey = `${DRAFT_PREFIX}${eventId}`;

  const focusEditor = useCallback(() => {
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => artistSearchRef.current?.focus(), 260);
  }, []);

  const load = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError("");
    const started = performance.now?.() || Date.now();
    try {
      const [eventData, lineup, owned] = await Promise.all([
        eventService.show(eventId),
        cutinappService.eventArtists(eventId),
        cutinappService.myArtists(),
      ]);
      if (!mountedRef.current) return;
      const nextArtists = lineup?.artists || [];
      const draft = readJson("sessionStorage", `${DRAFT_PREFIX}${eventId}`, null);
      const suggested = nextSuggestedSchedule(nextArtists, eventData);
      setEvent(eventData);
      setArtists(nextArtists);
      setMine(Array.isArray(owned) ? owned : []);
      setForm((current) => {
        if (draft?.form) return { ...buildSlot(nextArtists.length, prefsRef.current), ...draft.form, sort_order: draft.form.sort_order ?? nextArtists.length };
        if (current.artist_id) return current;
        return buildSlot(nextArtists.length, { ...prefsRef.current, scheduled_at: suggested });
      });
      if (draft?.mode) setMode(draft.mode);
      if (draft?.newArtist) setNewArtist(draft.newArtist);
      if (draft?.artistQuery) setArtistQuery(draft.artistQuery);
      trackTelemetry("lineup_loaded", {
        target: String(eventId),
        duration_ms: Math.round((performance.now?.() || Date.now()) - started),
        metadata: { artists: nextArtists.length, restored_draft: Boolean(draft) },
      });

      eventService.myEvents()
        .then((items) => {
          if (!mountedRef.current) return;
          setSourceEvents((Array.isArray(items) ? items : []).filter((item) => Number(item.id) !== Number(eventId)));
        })
        .catch(() => false);
    } catch (e) {
      if (mountedRef.current) setError(errorMessage(e, "Não foi possível carregar o line-up."));
    } finally {
      if (mountedRef.current && showLoader) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    mountedRef.current = true;
    openedAtRef.current = Date.now();
    load(true);
    return () => {
      mountedRef.current = false;
      if (dirtyRef.current) {
        trackTelemetry("lineup_editor_abandoned", {
          target: String(eventId),
          duration_ms: Date.now() - openedAtRef.current,
        });
      }
    };
  }, [eventId, load]);

  useEffect(() => {
    const handleShortcut = (e) => {
      if (e.altKey && String(e.key).toLowerCase() === "n") {
        e.preventDefault();
        focusEditor();
      }
      if (e.key === "Escape") {
        setArtistPickerOpen(false);
        setPreviewOpen(false);
        setAdvancedOpen(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [focusEditor]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    writeJson("sessionStorage", draftKey, { mode, form, newArtist, artistQuery, saved_at: Date.now() });
  }, [artistQuery, draftKey, form, mode, newArtist]);

  useEffect(() => {
    if (!undo) return undefined;
    const timer = window.setTimeout(() => setUndo(null), Math.max(0, undo.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [undo]);

  const editingArtist = useMemo(
    () => artists.find((artist) => Number(artist.id) === Number(editingArtistId)) || null,
    [artists, editingArtistId],
  );

  const available = useMemo(
    () => mine.filter((artist) => editingArtistId || !artists.some((linked) => Number(linked.id) === Number(artist.id))),
    [mine, artists, editingArtistId],
  );

  const filteredAvailable = useMemo(() => {
    const query = normalize(artistQuery);
    if (!query) return available.slice(0, 8);
    return available.filter((artist) => {
      const haystack = normalize([artist.stage_name, artist.name, artist.username, artist.email, artist.artist_type].filter(Boolean).join(" "));
      return haystack.includes(query);
    }).slice(0, 8);
  }, [artistQuery, available]);

  const conflictIds = useMemo(() => {
    const groups = new Map();
    artists.forEach((artist) => {
      const scheduled = toDateTimeLocal(artist?.pivot?.scheduled_at);
      const stage = normalize(artist?.pivot?.stage);
      if (!scheduled || !stage) return;
      const key = `${scheduled}|${stage}`;
      groups.set(key, [...(groups.get(key) || []), Number(artist.id)]);
    });
    const ids = new Set();
    groups.forEach((group) => {
      if (group.length > 1) group.forEach((id) => ids.add(id));
    });
    return ids;
  }, [artists]);

  const headliners = useMemo(() => artists.filter((artist) => Boolean(artist.pivot?.is_headliner)).length, [artists]);
  const scheduledCount = useMemo(() => artists.filter((artist) => artist.pivot?.scheduled_at).length, [artists]);
  const completion = useMemo(() => artists.length ? Math.round(artists.reduce((sum, artist) => sum + artistCompletion(artist), 0) / artists.length) : 0, [artists]);

  const readinessIssues = useMemo(() => {
    const issues = [];
    const withoutTime = artists.filter((artist) => !artist.pivot?.scheduled_at).length;
    const withoutStage = artists.filter((artist) => !artist.pivot?.stage).length;
    if (!artists.length) issues.push("Adicione pelo menos uma atração.");
    if (withoutTime) issues.push(`${withoutTime} atração(ões) sem horário.`);
    if (withoutStage) issues.push(`${withoutStage} atração(ões) sem palco/espaço.`);
    if (artists.length && !headliners) issues.push("Nenhuma atração principal definida.");
    if (conflictIds.size) issues.push("Há conflito de palco e horário no line-up.");
    return issues;
  }, [artists, conflictIds, headliners]);

  const displayArtists = useMemo(() => {
    if (viewMode !== "timeline") return artists;
    return [...artists].sort((a, b) => {
      const left = a?.pivot?.scheduled_at ? new Date(a.pivot.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
      const right = b?.pivot?.scheduled_at ? new Date(b.pivot.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER;
      if (left !== right) return left - right;
      return Number(a?.pivot?.sort_order || 0) - Number(b?.pivot?.sort_order || 0);
    });
  }, [artists, viewMode]);

  const clearDraft = () => {
    dirtyRef.current = false;
    removeStored("sessionStorage", draftKey);
  };

  const markDirty = () => {
    dirtyRef.current = true;
  };

  const resetEditor = (nextArtists = artists, options = {}) => {
    const suggested = nextSuggestedSchedule(nextArtists, event);
    setEditingArtistId(null);
    setMode(options.keepMode ? mode : "existing");
    setAdvancedOpen(false);
    setArtistQuery("");
    setForm(buildSlot(nextArtists.length, { ...prefsRef.current, scheduled_at: suggested }));
    setNewArtist({ stage_name: "", artist_type: "solo" });
    clearDraft();
  };

  const setSlot = (key, value) => {
    markDirty();
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setNewArtistField = (key, value) => {
    markDirty();
    setNewArtist((current) => ({ ...current, [key]: value }));
  };

  const rememberPreferences = (slot) => {
    prefsRef.current = {
      participation_type: slot.participation_type || "show",
      stage: slot.stage || "",
    };
    writeJson("localStorage", PREFS_KEY, prefsRef.current);
  };

  const selectArtist = (artist) => {
    markDirty();
    setForm((current) => ({
      ...current,
      artist_id: String(artist.id),
      scheduled_at: current.scheduled_at || nextSuggestedSchedule(artists, event),
    }));
    setArtistQuery(artist.stage_name || artist.name || "");
    setArtistPickerOpen(false);
  };

  const attachSlot = async (artistId, slot, { message, keepAdding = false, action = "lineup_artist_saved" } = {}) => {
    const response = await cutinappService.attachArtist(eventId, formPayload(artistId, slot));
    const nextArtists = response?.artists || (await cutinappService.eventArtists(eventId))?.artists || [];
    if (!mountedRef.current) return nextArtists;
    setArtists(nextArtists);
    setSuccess(message || response?.message || "Line-up atualizado.");
    rememberPreferences(slot);
    clearDraft();
    trackTelemetry(action, {
      target: String(eventId),
      metadata: { artist_id: Number(artistId), artists: nextArtists.length, keep_adding: keepAdding },
    });
    resetEditor(nextArtists, { keepMode: keepAdding });
    if (keepAdding) window.setTimeout(focusEditor, 100);
    return nextArtists;
  };

  const submitExisting = async (keepAdding = false) => {
    if (!form.artist_id || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await attachSlot(form.artist_id, form, {
        keepAdding,
        action: editingArtistId ? "lineup_artist_updated" : "lineup_artist_added",
        message: editingArtistId ? "Atração atualizada no line-up." : "Atração adicionada ao line-up.",
      });
      trackTelemetry("lineup_time_to_action", {
        target: String(eventId),
        duration_ms: Date.now() - openedAtRef.current,
        metadata: { action: editingArtistId ? "update" : "add" },
      });
    } catch (err) {
      if (mountedRef.current) setError(errorMessage(err, "Não foi possível salvar a atração. Seus dados continuam preenchidos."));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const saveExisting = (e) => {
    e.preventDefault();
    submitExisting(false);
  };

  const createAndAttach = async (e) => {
    e.preventDefault();
    const stageName = newArtist.stage_name.trim();
    if (stageName.length < 2 || busy) {
      if (stageName.length < 2) setError("Informe o nome artístico da atração.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
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
      await attachSlot(artist.id, form, {
        action: "lineup_artist_created_and_added",
        message: `${artist.stage_name} foi cadastrado e adicionado ao line-up.`,
      });
    } catch (err) {
      if (mountedRef.current) setError(errorMessage(err, "Não foi possível cadastrar a nova atração. Seus dados continuam preenchidos."));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const edit = (artist) => {
    const pivot = artist.pivot || {};
    setMode("existing");
    setEditingArtistId(artist.id);
    setArtistQuery(artist.stage_name || "");
    setAdvancedOpen(Boolean(pivot.description || pivot.stage || pivot.is_headliner));
    setForm({
      artist_id: String(artist.id),
      participation_type: pivot.participation_type || "show",
      description: pivot.description || "",
      scheduled_at: toDateTimeLocal(pivot.scheduled_at),
      stage: pivot.stage || "",
      sort_order: Number(pivot.sort_order || 0),
      is_headliner: Boolean(pivot.is_headliner),
    });
    clearDraft();
    setError("");
    setSuccess("");
    window.setTimeout(focusEditor, 40);
  };

  const generateDescription = async () => {
    const selected = editingArtist || available.find((artist) => String(artist.id) === String(form.artist_id));
    const title = selected?.stage_name || newArtist.stage_name.trim();
    if (!title) {
      setError("Selecione ou informe a atração antes de gerar a descrição.");
      return;
    }
    setAiBusy(true);
    setError("");
    try {
      const response = await aiContentService.generateDescription({
        entityType: "event-lineup-participation",
        title,
        currentDescription: form.description,
        context: {
          event: event?.title || "",
          participation: form.participation_type,
          stage: form.stage,
          scheduled_at: form.scheduled_at,
          headliner: form.is_headliner ? "sim" : "não",
        },
        tone: "vibrante, elegante, objetivo e adequado a uma página de evento",
      });
      setSlot("description", response.description);
      setAdvancedOpen(true);
      setSuccess("Descrição sugerida pela IA. Revise antes de salvar.");
      trackTelemetry("lineup_ai_description_generated", { target: String(eventId), metadata: { artist: title } });
    } catch (err) {
      setError(errorMessage(err, "Não foi possível gerar a descrição com IA agora."));
    } finally {
      setAiBusy(false);
    }
  };

  const quickUpdate = async (artist, patch) => {
    if (savingArtistId || reordering) return;
    const previous = artists;
    const optimistic = artists.map((item) => Number(item.id) === Number(artist.id)
      ? { ...item, pivot: { ...(item.pivot || {}), ...patch } }
      : item);
    setArtists(optimistic);
    setSavingArtistId(artist.id);
    setError("");
    try {
      const updatedArtist = optimistic.find((item) => Number(item.id) === Number(artist.id));
      const response = await cutinappService.attachArtist(eventId, pivotPayload(updatedArtist));
      if (response?.artists && mountedRef.current) setArtists(response.artists);
      trackTelemetry("lineup_quick_edit", { target: String(eventId), metadata: { artist_id: Number(artist.id), fields: Object.keys(patch) } });
    } catch (err) {
      if (mountedRef.current) {
        setArtists(previous);
        setError(errorMessage(err, "Não foi possível salvar o ajuste rápido. A alteração foi desfeita."));
      }
    } finally {
      if (mountedRef.current) setSavingArtistId(null);
    }
  };

  const remove = async (artist) => {
    if (savingArtistId || reordering) return;
    const previous = artists;
    const nextArtists = artists.filter((item) => Number(item.id) !== Number(artist.id));
    setArtists(nextArtists);
    setSuccess("");
    setError("");
    try {
      await cutinappService.detachArtist(eventId, artist.id);
      setUndo({ artist, expiresAt: Date.now() + 8000 });
      if (Number(editingArtistId) === Number(artist.id)) resetEditor(nextArtists);
      trackTelemetry("lineup_artist_removed", { target: String(eventId), metadata: { artist_id: Number(artist.id), undo_available: true } });
    } catch (err) {
      if (mountedRef.current) {
        setArtists(previous);
        setError(errorMessage(err, "Não foi possível remover a atração."));
      }
    }
  };

  const undoRemove = async () => {
    if (!undo) return;
    const removed = undo.artist;
    setUndo(null);
    setSavingArtistId(removed.id);
    try {
      const response = await cutinappService.attachArtist(eventId, pivotPayload(removed));
      const restored = response?.artists || [...artists, removed].sort((a, b) => Number(a?.pivot?.sort_order || 0) - Number(b?.pivot?.sort_order || 0));
      if (mountedRef.current) setArtists(restored);
      setSuccess(`${removed.stage_name} voltou ao line-up.`);
      trackTelemetry("lineup_remove_undone", { target: String(eventId), metadata: { artist_id: Number(removed.id) } });
    } catch (err) {
      setError(errorMessage(err, "Não foi possível desfazer a remoção."));
    } finally {
      setSavingArtistId(null);
    }
  };

  const persistReorder = async (nextArtists) => {
    const previous = artists;
    const normalized = nextArtists.map((artist, index) => ({ ...artist, pivot: { ...(artist.pivot || {}), sort_order: index } }));
    setArtists(normalized);
    setReordering(true);
    setError("");
    try {
      for (const artist of normalized) {
        await cutinappService.attachArtist(eventId, pivotPayload(artist));
      }
      const refreshed = await cutinappService.eventArtists(eventId);
      if (mountedRef.current && refreshed?.artists) setArtists(refreshed.artists);
      trackTelemetry("lineup_reordered", { target: String(eventId), metadata: { artists: normalized.length } });
    } catch (err) {
      if (mountedRef.current) {
        setArtists(previous);
        setError(errorMessage(err, "Não foi possível salvar a nova ordem. A ordem anterior foi restaurada."));
      }
    } finally {
      if (mountedRef.current) setReordering(false);
    }
  };

  const dropOn = (targetArtistId) => {
    if (!dragArtistId || Number(dragArtistId) === Number(targetArtistId) || viewMode === "timeline") return;
    const from = artists.findIndex((artist) => Number(artist.id) === Number(dragArtistId));
    const to = artists.findIndex((artist) => Number(artist.id) === Number(targetArtistId));
    if (from < 0 || to < 0) return;
    const next = [...artists];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragArtistId(null);
    persistReorder(next);
  };

  const copyLineup = async () => {
    if (!sourceEventId || copying) return;
    setCopying(true);
    setError("");
    setSuccess("");
    try {
      const source = await cutinappService.eventArtists(sourceEventId);
      const sourceArtists = source?.artists || [];
      const existingIds = new Set(artists.map((artist) => Number(artist.id)));
      let copied = 0;
      for (const sourceArtist of sourceArtists) {
        if (existingIds.has(Number(sourceArtist.id))) continue;
        const payload = pivotPayload(sourceArtist, {
          scheduled_at: adaptScheduleToEvent(sourceArtist?.pivot?.scheduled_at, event),
          sort_order: artists.length + copied,
        });
        await cutinappService.attachArtist(eventId, payload);
        existingIds.add(Number(sourceArtist.id));
        copied += 1;
      }
      const refreshed = await cutinappService.eventArtists(eventId);
      if (mountedRef.current) setArtists(refreshed?.artists || artists);
      setSuccess(copied ? `${copied} atração(ões) copiadas. Horários foram adaptados à data deste evento.` : "Nenhuma atração nova para copiar.");
      trackTelemetry("lineup_copied_from_event", { target: String(eventId), metadata: { source_event_id: Number(sourceEventId), copied } });
    } catch (err) {
      setError(errorMessage(err, "Não foi possível copiar o line-up deste evento."));
    } finally {
      setCopying(false);
    }
  };

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name || !artists.length) {
      setError("Informe um nome e tenha pelo menos uma atração antes de salvar o modelo.");
      return;
    }
    const template = {
      id: `${Date.now()}`,
      name,
      created_at: new Date().toISOString(),
      items: artists.map((artist) => ({
        id: artist.id,
        stage_name: artist.stage_name,
        pivot: { ...(artist.pivot || {}) },
      })),
    };
    const next = [template, ...templates].slice(0, 12);
    setTemplates(next);
    writeJson("localStorage", TEMPLATES_KEY, next);
    setTemplateName("");
    setSelectedTemplateId(template.id);
    setSuccess(`Modelo “${name}” salvo neste dispositivo.`);
    trackTelemetry("lineup_template_saved", { target: String(eventId), metadata: { items: template.items.length } });
  };

  const applyTemplate = async () => {
    const template = templates.find((item) => String(item.id) === String(selectedTemplateId));
    if (!template || copying) return;
    setCopying(true);
    setError("");
    try {
      let applied = 0;
      for (let index = 0; index < template.items.length; index += 1) {
        const item = template.items[index];
        try {
          await cutinappService.attachArtist(eventId, {
            artist_id: Number(item.id),
            participation_type: item.pivot?.participation_type || "show",
            description: item.pivot?.description || null,
            scheduled_at: adaptScheduleToEvent(item.pivot?.scheduled_at, event) || null,
            stage: item.pivot?.stage || null,
            sort_order: index,
            is_headliner: Boolean(item.pivot?.is_headliner),
          });
          applied += 1;
        } catch (_) {
          // Continue applying valid artists even if a stale profile is no longer available.
        }
      }
      const refreshed = await cutinappService.eventArtists(eventId);
      if (mountedRef.current) setArtists(refreshed?.artists || artists);
      setSuccess(`${applied} atração(ões) aplicadas do modelo “${template.name}”.`);
      trackTelemetry("lineup_template_applied", { target: String(eventId), metadata: { template_id: template.id, applied } });
    } catch (err) {
      setError(errorMessage(err, "Não foi possível aplicar o modelo."));
    } finally {
      setCopying(false);
    }
  };

  const deleteTemplate = () => {
    if (!selectedTemplateId) return;
    const next = templates.filter((item) => String(item.id) !== String(selectedTemplateId));
    setTemplates(next);
    writeJson("localStorage", TEMPLATES_KEY, next);
    setSelectedTemplateId("");
    setSuccess("Modelo removido deste dispositivo.");
  };

  const advancedFields = (
    <div className="cut-lineup-advanced-fields">
      <Form.Group>
        <Form.Label>Palco / espaço</Form.Label>
        <Form.Control
          value={form.stage}
          disabled={busy}
          placeholder="Ex.: Palco principal"
          onChange={(e) => setSlot("stage", e.target.value)}
        />
      </Form.Group>
      <Form.Group>
        <div className="cut-lineup-label-row">
          <Form.Label>Descrição da participação</Form.Label>
          <button type="button" className="cut-lineup-ai-button" onClick={generateDescription} disabled={aiBusy || busy}>
            <i className="fa-solid fa-wand-magic-sparkles" />{aiBusy ? "Gerando..." : "Gerar com IA"}
          </button>
        </div>
        <Form.Control
          as="textarea"
          rows={3}
          value={form.description}
          disabled={busy}
          placeholder="Ex.: DJ set de encerramento com repertório especial"
          onChange={(e) => setSlot("description", e.target.value)}
        />
      </Form.Group>
      <Form.Check
        type="switch"
        label="Destacar como atração principal"
        checked={form.is_headliner}
        disabled={busy}
        onChange={(e) => setSlot("is_headliner", e.target.checked)}
      />
    </div>
  );

  const coreFields = (
    <div className="cut-lineup-core-fields">
      <Form.Group>
        <Form.Label>Participação *</Form.Label>
        <Form.Select value={form.participation_type} disabled={busy} onChange={(e) => setSlot("participation_type", e.target.value)}>
          {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </Form.Select>
      </Form.Group>
      <Form.Group>
        <Form.Label>Horário previsto</Form.Label>
        <Form.Control type="datetime-local" value={form.scheduled_at} disabled={busy} onChange={(e) => setSlot("scheduled_at", e.target.value)} />
        <Form.Text>O próximo horário é sugerido automaticamente e pode ser alterado.</Form.Text>
      </Form.Group>
    </div>
  );

  if (loading) {
    return (
      <div className="cut-app-page cut-lineup-page">
        <NavlogComponent />
        <Container className="cut-page-container py-4 py-lg-5" aria-busy="true">
          <div className="cut-lineup-skeleton-hero cut-skeleton" />
          <div className="cut-lineup-skeleton-metrics">
            <div className="cut-skeleton" /><div className="cut-skeleton" /><div className="cut-skeleton" />
          </div>
          <div className="cut-lineup-skeleton-grid">
            <div className="cut-skeleton" /><div className="cut-skeleton" />
          </div>
          <span className="cut-status-live" role="status">Carregando line-up</span>
        </Container>
      </div>
    );
  }

  return (
    <div className="cut-app-page cut-lineup-page">
      <NavlogComponent />
      <Container className="cut-page-container py-4 py-lg-5">
        <header className="cut-lineup-hero">
          <div>
            <span className="cut-eyebrow">Line-up do evento</span>
            <h1>{event?.title || "Atrações do evento"}</h1>
            <p>Monte a programação com menos campos, edição rápida, prevenção de conflitos e prévia em tempo real.</p>
          </div>
          <div className="cut-lineup-hero-actions">
            <Button variant="outline-light" onClick={() => navigate(`/event/edit/${eventId}`)}>
              <i className="fa-solid fa-arrow-left" />Voltar ao evento
            </Button>
            <Button variant="outline-light" onClick={() => { setPreviewOpen((value) => !value); trackTelemetry("lineup_preview_toggled", { target: String(eventId) }); }}>
              <i className="fa-regular fa-eye" />{previewOpen ? "Fechar prévia" : "Prévia pública"}
            </Button>
            {event?.slug && event?.is_published && (
              <Button variant="outline-light" onClick={() => navigate(`/event/${event.slug}`)}>
                <i className="fa-solid fa-arrow-up-right-from-square" />Página pública
              </Button>
            )}
          </div>
        </header>

        <section className="cut-lineup-summary" aria-label="Resumo do line-up">
          <div><strong>{artists.length}</strong><span>Atrações</span></div>
          <div><strong>{headliners}</strong><span>Destaques</span></div>
          <div><strong>{scheduledCount}/{artists.length || 0}</strong><span>Com horário · {completion}% completo</span></div>
        </section>

        <section className={`cut-lineup-readiness ${readinessIssues.length ? "has-issues" : "is-ready"}`} aria-label="Qualidade do line-up">
          <div className="cut-lineup-readiness-copy">
            <i className={`fa-solid ${readinessIssues.length ? "fa-list-check" : "fa-circle-check"}`} />
            <div>
              <strong>{readinessIssues.length ? "Antes de divulgar" : "Line-up pronto para o público"}</strong>
              {readinessIssues.length ? (
                <ul>{readinessIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              ) : <span>Horários, espaços e destaques estão consistentes.</span>}
            </div>
          </div>
          <div className="cut-lineup-progress" aria-label={`${completion}% de completude`}>
            <span style={{ width: `${completion}%` }} />
          </div>
        </section>

        {error && (
          <div className="cut-inline-error" role="alert" aria-live="assertive">
            <span>{error}</span>
            <Button size="sm" variant="outline-light" onClick={() => load(false)}>Tentar novamente</Button>
          </div>
        )}
        {success && <Alert variant="success" role="status" aria-live="polite" className="mt-3">{success}</Alert>}

        {previewOpen && (
          <section className="cut-lineup-preview-shell" aria-label="Prévia do line-up público">
            <div className="cut-lineup-preview-toolbar">
              <div>
                <span className="cut-eyebrow">Como o público verá</span>
                <strong>Prévia instantânea</strong>
              </div>
              <div className="cut-lineup-device-switch" role="group" aria-label="Tamanho da prévia">
                <button type="button" className={previewDevice === "mobile" ? "is-active" : ""} onClick={() => setPreviewDevice("mobile")}><i className="fa-solid fa-mobile-screen" />Mobile</button>
                <button type="button" className={previewDevice === "desktop" ? "is-active" : ""} onClick={() => setPreviewDevice("desktop")}><i className="fa-solid fa-desktop" />Desktop</button>
              </div>
            </div>
            <div className={`cut-lineup-public-preview is-${previewDevice}`}>
              <span className="cut-eyebrow">Programação</span>
              <h3>{event?.title || "Evento"}</h3>
              {displayArtists.length ? displayArtists.map((artist) => (
                <div className="cut-lineup-preview-item" key={`preview-${artist.id}`}>
                  <span>{artist.pivot?.scheduled_at ? formatScheduledAt(artist.pivot.scheduled_at) : "Horário a definir"}</span>
                  <strong>{artist.stage_name}</strong>
                  <small>{artist.pivot?.stage || artist.pivot?.participation_type || "Participação"}</small>
                </div>
              )) : <p>As atrações aparecerão aqui conforme forem adicionadas.</p>}
            </div>
          </section>
        )}

        <details className="cut-lineup-tools">
          <summary><i className="fa-solid fa-bolt" />Reaproveitar programação e modelos</summary>
          <div className="cut-lineup-tools-grid">
            <div>
              <strong>Copiar de outro evento</strong>
              <p>Reaproveita artistas e adapta os horários para a data atual.</p>
              <div className="cut-lineup-tool-row">
                <Form.Select value={sourceEventId} onChange={(e) => setSourceEventId(e.target.value)} disabled={copying} aria-label="Evento de origem">
                  <option value="">Selecione um evento</option>
                  {sourceEvents.map((item) => <option key={item.id} value={item.id}>{item.title || item.name || `Evento #${item.id}`}</option>)}
                </Form.Select>
                <Button onClick={copyLineup} disabled={!sourceEventId || copying}>{copying ? "Copiando..." : "Copiar"}</Button>
              </div>
            </div>
            <div>
              <strong>Modelos do line-up</strong>
              <p>Salvos localmente para repetir a estrutura sem cadastrar tudo de novo.</p>
              <div className="cut-lineup-tool-row">
                <Form.Control value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Ex.: Sexta eletrônica" />
                <Button variant="outline-light" onClick={saveTemplate} disabled={!artists.length}>Salvar modelo</Button>
              </div>
              {templates.length > 0 && (
                <div className="cut-lineup-tool-row mt-2">
                  <Form.Select value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)} aria-label="Modelo salvo">
                    <option value="">Selecione um modelo</option>
                    {templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </Form.Select>
                  <Button onClick={applyTemplate} disabled={!selectedTemplateId || copying}>Aplicar</Button>
                  <Button variant="outline-danger" onClick={deleteTemplate} disabled={!selectedTemplateId} aria-label="Excluir modelo"><i className="fa-solid fa-trash" /></Button>
                </div>
              )}
            </div>
          </div>
        </details>

        <Row className="g-4 align-items-start mt-1">
          <Col lg={5}>
            <Card className="cut-panel cut-lineup-editor-card" ref={editorRef}>
              <Card.Body className="p-3 p-md-4">
                <div className="cut-lineup-editor-heading">
                  <div>
                    <span className="cut-eyebrow">{editingArtistId ? "Editando atração" : "Adicionar ao line-up"}</span>
                    <h2>{editingArtist?.stage_name || "Nova atração"}</h2>
                    <p>{editingArtistId ? "Altere somente o necessário e salve." : "O essencial primeiro. Detalhes ficam opcionais."}</p>
                  </div>
                  {editingArtistId && <Button size="sm" variant="outline-light" onClick={() => resetEditor()} disabled={busy}>Cancelar</Button>}
                </div>

                {!editingArtistId && (
                  <div className="cut-lineup-mode-switch" role="tablist" aria-label="Forma de adicionar atração">
                    <button type="button" role="tab" aria-selected={mode === "existing"} className={mode === "existing" ? "is-active" : ""} onClick={() => { setMode("existing"); markDirty(); }}>
                      <i className="fa-solid fa-magnifying-glass" />Encontrar artista
                    </button>
                    <button type="button" role="tab" aria-selected={mode === "new"} className={mode === "new" ? "is-active" : ""} onClick={() => { setMode("new"); markDirty(); }}>
                      <i className="fa-solid fa-user-plus" />Cadastrar rápido
                    </button>
                  </div>
                )}

                {(mode === "existing" || editingArtistId) ? (
                  <Form onSubmit={saveExisting} className="cut-lineup-form" aria-busy={busy} onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitExisting(false); }
                  }}>
                    <Form.Group className="cut-lineup-artist-picker">
                      <Form.Label>Artista / formação *</Form.Label>
                      {editingArtistId ? (
                        <div className="cut-lineup-selected-artist"><span>{editingArtist?.stage_name}</span><Badge bg="secondary">{TYPE_LABELS[editingArtist?.artist_type] || "Artista"}</Badge></div>
                      ) : (
                        <>
                          <div className="cut-lineup-search-wrap">
                            <i className="fa-solid fa-magnifying-glass" />
                            <Form.Control
                              ref={artistSearchRef}
                              role="combobox"
                              aria-expanded={artistPickerOpen}
                              aria-controls="cut-lineup-artist-results"
                              autoComplete="off"
                              value={artistQuery}
                              placeholder="Busque por nome, usuário ou e-mail"
                              onFocus={() => setArtistPickerOpen(true)}
                              onBlur={() => window.setTimeout(() => setArtistPickerOpen(false), 140)}
                              onChange={(e) => {
                                markDirty();
                                setArtistQuery(e.target.value);
                                setForm((current) => ({ ...current, artist_id: "" }));
                                setArtistPickerOpen(true);
                              }}
                            />
                          </div>
                          {artistPickerOpen && (
                            <div className="cut-lineup-search-results" id="cut-lineup-artist-results" role="listbox">
                              {filteredAvailable.map((artist) => (
                                <button type="button" role="option" aria-selected={String(form.artist_id) === String(artist.id)} key={artist.id} onMouseDown={(e) => e.preventDefault()} onClick={() => selectArtist(artist)}>
                                  <span className="cut-lineup-mini-avatar">{avatarSource(artist) ? <img src={avatarSource(artist)} alt="" /> : String(artist.stage_name || "A").slice(0, 1).toUpperCase()}</span>
                                  <span><strong>{artist.stage_name}</strong><small>{TYPE_LABELS[artist.artist_type] || "Artista"}{artist.username ? ` · @${artist.username}` : ""}</small></span>
                                </button>
                              ))}
                              {!filteredAvailable.length && (
                                <button type="button" className="cut-lineup-create-result" onMouseDown={(e) => e.preventDefault()} onClick={() => {
                                  const name = artistQuery.trim();
                                  setMode("new");
                                  setNewArtist((current) => ({ ...current, stage_name: name }));
                                  setArtistPickerOpen(false);
                                }}>
                                  <i className="fa-solid fa-plus" />Cadastrar {artistQuery.trim() ? `“${artistQuery.trim()}”` : "nova atração"}
                                </button>
                              )}
                            </div>
                          )}
                          <Form.Text>{available.length ? `${available.length} perfil(is) disponível(is).` : "Nenhum perfil disponível; use o cadastro rápido."}</Form.Text>
                        </>
                      )}
                    </Form.Group>

                    {coreFields}
                    <button type="button" className="cut-lineup-more-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((value) => !value)}>
                      <span><i className="fa-solid fa-sliders" />Mais opções</span><i className={`fa-solid fa-chevron-${advancedOpen ? "up" : "down"}`} />
                    </button>
                    {advancedOpen && advancedFields}

                    <div className="cut-lineup-submit-row">
                      <Button type="submit" disabled={busy || !form.artist_id}>
                        <i className={`${editingArtistId ? "fa-solid fa-floppy-disk" : "fa-solid fa-plus"}`} />
                        {busy ? "Salvando..." : editingArtistId ? "Salvar alterações" : "Adicionar ao line-up"}
                      </Button>
                      {!editingArtistId && (
                        <Button type="button" variant="outline-light" disabled={busy || !form.artist_id} onClick={() => submitExisting(true)} title="Salva e mantém o editor pronto para a próxima atração">
                          Salvar e adicionar outra
                        </Button>
                      )}
                    </div>
                    <Form.Text>Atalho no desktop: Ctrl/⌘ + Enter para salvar · Alt + N para voltar ao editor.</Form.Text>
                  </Form>
                ) : (
                  <Form onSubmit={createAndAttach} className="cut-lineup-form" aria-busy={busy}>
                    <div className="cut-lineup-two-cols">
                      <Form.Group>
                        <Form.Label>Nome artístico *</Form.Label>
                        <Form.Control ref={artistSearchRef} required minLength={2} maxLength={255} value={newArtist.stage_name} disabled={busy} placeholder="Ex.: DJ Marco Roger" onChange={(e) => setNewArtistField("stage_name", e.target.value)} />
                      </Form.Group>
                      <Form.Group>
                        <Form.Label>Tipo *</Form.Label>
                        <Form.Select value={newArtist.artist_type} disabled={busy} onChange={(e) => setNewArtistField("artist_type", e.target.value)}>
                          {ARTIST_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </Form.Select>
                      </Form.Group>
                    </div>
                    <div className="cut-lineup-info"><i className="fa-solid fa-circle-info" /><span>Criaremos um perfil provisório. Se já existir alguém com esse nome, prefira encontrá-lo na busca para evitar duplicidade.</span></div>
                    {coreFields}
                    <button type="button" className="cut-lineup-more-toggle" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((value) => !value)}>
                      <span><i className="fa-solid fa-sliders" />Mais opções</span><i className={`fa-solid fa-chevron-${advancedOpen ? "up" : "down"}`} />
                    </button>
                    {advancedOpen && advancedFields}
                    <Button type="submit" disabled={busy || newArtist.stage_name.trim().length < 2} className="w-100">
                      <i className="fa-solid fa-user-plus" />{busy ? "Cadastrando..." : "Cadastrar e adicionar"}
                    </Button>
                  </Form>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={7}>
            <div className="cut-lineup-list-heading">
              <div>
                <span className="cut-eyebrow">Escalação atual</span>
                <h2>{artists.length ? `${artists.length} atração(ões)` : "Line-up ainda vazio"}</h2>
                <p>{viewMode === "timeline" ? "Ordem cronológica por horário." : "Arraste os cards para reorganizar a ordem pública."}</p>
              </div>
              <div className="cut-lineup-view-switch" role="group" aria-label="Visualização do line-up">
                <button type="button" className={viewMode === "cards" ? "is-active" : ""} onClick={() => setViewMode("cards")}><i className="fa-solid fa-grip" />Cards</button>
                <button type="button" className={viewMode === "timeline" ? "is-active" : ""} onClick={() => setViewMode("timeline")}><i className="fa-solid fa-timeline" />Timeline</button>
              </div>
            </div>

            {artists.length === 0 ? (
              <Card className="cut-empty-state cut-lineup-empty">
                <Card.Body>
                  <i className="fa-solid fa-music" />
                  <h3>Comece o line-up</h3>
                  <p>Adicione a primeira atração. Horário sugerido, cadastro rápido e IA reduzem o trabalho manual.</p>
                  <Button onClick={focusEditor}><i className="fa-solid fa-plus" />Adicionar primeira atração</Button>
                </Card.Body>
              </Card>
            ) : (
              <div className={`cut-lineup-list is-${viewMode}`} aria-busy={reordering || Boolean(savingArtistId)}>
                {displayArtists.map((artist, index) => {
                  const completionValue = artistCompletion(artist);
                  const hasConflict = conflictIds.has(Number(artist.id));
                  const saving = Number(savingArtistId) === Number(artist.id);
                  return (
                    <Card
                      className={`cut-panel cut-lineup-item ${artist.pivot?.is_headliner ? "is-headliner" : ""} ${hasConflict ? "has-conflict" : ""} ${saving ? "is-saving" : ""}`}
                      key={artist.id}
                      draggable={viewMode === "cards" && !reordering}
                      onDragStart={() => setDragArtistId(artist.id)}
                      onDragEnd={() => setDragArtistId(null)}
                      onDragOver={(e) => { if (viewMode === "cards") e.preventDefault(); }}
                      onDrop={() => dropOn(artist.id)}
                    >
                      <Card.Body className="p-3 p-md-4">
                        <div className="cut-lineup-item-main">
                          <div className="cut-lineup-drag" aria-hidden="true"><i className="fa-solid fa-grip-vertical" /></div>
                          <div className="cut-lineup-avatar">{avatarSource(artist) ? <img src={avatarSource(artist)} alt="" /> : String(artist.stage_name || "A").slice(0, 1).toUpperCase()}</div>
                          <div className="cut-lineup-item-copy">
                            <div className="cut-lineup-item-title">
                              <strong>{artist.stage_name}</strong>
                              <Badge bg="secondary">{TYPE_LABELS[artist.artist_type] || "Artista"}</Badge>
                              {artist.pivot?.is_headliner && <span className="cut-lineup-headliner-badge"><i className="fa-solid fa-star" />Principal</span>}
                              {hasConflict && <span className="cut-lineup-conflict-badge"><i className="fa-solid fa-triangle-exclamation" />Conflito</span>}
                            </div>
                            <div className="cut-lineup-meta">
                              <span><i className="fa-solid fa-microphone-lines" />{artist.pivot?.participation_type || "Participação"}</span>
                              <span><i className="fa-regular fa-clock" />{artist.pivot?.scheduled_at ? formatScheduledAt(artist.pivot.scheduled_at) : "Sem horário"}</span>
                              <span><i className="fa-solid fa-location-dot" />{artist.pivot?.stage || "Sem palco"}</span>
                            </div>
                            {artist.pivot?.description && <p>{artist.pivot.description}</p>}
                            <div className="cut-lineup-completion"><span><i style={{ width: `${completionValue}%` }} /></span><small>{completionValue === 100 ? "Completo" : `${completionValue}% completo`}</small></div>
                          </div>
                        </div>

                        <div className="cut-lineup-quick-edit" aria-label={`Ajustes rápidos de ${artist.stage_name}`}>
                          <Form.Select
                            aria-label="Participação"
                            value={artist.pivot?.participation_type || "show"}
                            disabled={saving || reordering}
                            onChange={(e) => quickUpdate(artist, { participation_type: e.target.value })}
                          >
                            {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                          </Form.Select>
                          <Form.Control
                            key={`${artist.id}-${artist.pivot?.scheduled_at || "empty"}`}
                            type="datetime-local"
                            aria-label="Horário"
                            defaultValue={toDateTimeLocal(artist.pivot?.scheduled_at)}
                            disabled={saving || reordering}
                            onBlur={(e) => {
                              if (e.target.value !== toDateTimeLocal(artist.pivot?.scheduled_at)) quickUpdate(artist, { scheduled_at: e.target.value || null });
                            }}
                          />
                          <Form.Control
                            key={`${artist.id}-${artist.pivot?.stage || "empty"}`}
                            aria-label="Palco ou espaço"
                            defaultValue={artist.pivot?.stage || ""}
                            placeholder="Palco / espaço"
                            disabled={saving || reordering}
                            onBlur={(e) => {
                              if (e.target.value.trim() !== String(artist.pivot?.stage || "").trim()) quickUpdate(artist, { stage: e.target.value.trim() || null });
                            }}
                          />
                          <label className="cut-lineup-headliner-switch">
                            <input type="checkbox" checked={Boolean(artist.pivot?.is_headliner)} disabled={saving || reordering} onChange={(e) => quickUpdate(artist, { is_headliner: e.target.checked })} />
                            <span><i className="fa-solid fa-star" />Principal</span>
                          </label>
                        </div>

                        <div className="cut-lineup-item-actions">
                          <Button variant="outline-light" size="sm" disabled={saving || reordering} onClick={() => edit(artist)}><i className="fa-solid fa-pen" />Editar detalhes</Button>
                          <Button variant="outline-danger" size="sm" disabled={saving || reordering} onClick={() => remove(artist)}><i className="fa-solid fa-trash" />Remover</Button>
                        </div>
                        {saving && <span className="cut-lineup-saving-label" role="status"><i className="fa-solid fa-circle-notch fa-spin" />Salvando ajuste...</span>}
                        {viewMode === "cards" && <span className="cut-lineup-order-label">#{String(index + 1).padStart(2, "0")}</span>}
                      </Card.Body>
                    </Card>
                  );
                })}
              </div>
            )}
          </Col>
        </Row>
      </Container>

      <button type="button" className="cut-lineup-mobile-add" onClick={focusEditor} aria-label="Adicionar atração"><i className="fa-solid fa-plus" /><span>Adicionar</span></button>

      {undo && (
        <div className="cut-undo-bar" role="status" aria-live="polite">
          <span><strong>{undo.artist.stage_name}</strong> foi removido.</span>
          <Button size="sm" onClick={undoRemove}>Desfazer</Button>
        </div>
      )}
    </div>
  );
}
