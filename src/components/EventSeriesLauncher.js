import React, { useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import eventService from "../services/EventService";
import EventSeriesForm from "./EventSeriesForm";

const toDateInput = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const tomorrowDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
};

const suggestedDuplicateDate = (event) => {
  const source = new Date(event?.start_date);
  const candidate = Number.isNaN(source.getTime()) ? tomorrowDate() : new Date(source);
  candidate.setDate(candidate.getDate() + 7);

  const tomorrow = tomorrowDate();
  if (candidate < tomorrow) return toDateInput(tomorrow);
  return toDateInput(candidate);
};

export default function EventSeriesLauncher() {
  const location = useLocation();
  const navigate = useNavigate();
  const editMatch = location.pathname.match(/^\/event\/edit\/(\d+)\/?$/);
  const editingEventId = editMatch ? Number(editMatch[1]) : null;
  const isEditMode = Boolean(editingEventId);
  const isManageMode = location.pathname === "/event/manage";
  const visible = isManageMode || isEditMode;

  const [show, setShow] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState("");
  const [editingEvent, setEditingEvent] = useState(null);
  const [duplicateDate, setDuplicateDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) return;

    setLoading(true);
    setError("");

    if (isEditMode) {
      setEditingEvent(null);
      setDuplicateDate("");
      eventService.show(editingEventId)
        .then((item) => {
          setEditingEvent(item);
          setDuplicateDate(suggestedDuplicateDate(item));
        })
        .catch((err) => setError(err?.message || "Não foi possível carregar o evento para duplicação."))
        .finally(() => setLoading(false));
      return;
    }

    eventService.myEvents()
      .then((items) => {
        setEvents(items);
        setEventId((current) => current || (items[0]?.id ? String(items[0].id) : ""));
      })
      .catch((err) => setError(err?.message || "Não foi possível carregar seus eventos."))
      .finally(() => setLoading(false));
  }, [show, isEditMode, editingEventId]);

  useEffect(() => {
    setShow(false);
    setError("");
    setEditingEvent(null);
    setDuplicateDate("");
  }, [location.pathname]);

  if (!visible) return null;

  const selected = isEditMode
    ? editingEvent
    : events.find((item) => String(item.id) === eventId) || null;

  const submit = async (payload) => {
    if (!selected || isEditMode) return;
    setBusy(true);
    setError("");
    try {
      const result = await eventService.series(selected.id, payload);
      setMessage(result?.message || "Novas edições criadas.");
      setShow(false);
      window.dispatchEvent(new CustomEvent("cutinapp:event-series-created", { detail: result }));
    } catch (err) {
      setError(err?.message || "Não foi possível criar as novas edições.");
    } finally {
      setBusy(false);
    }
  };

  const duplicateCurrentEvent = async () => {
    if (!selected || !duplicateDate) {
      setError("Escolha a nova data do evento.");
      return;
    }

    if (toDateInput(selected.start_date) === duplicateDate) {
      setError("Escolha uma data diferente da data do evento original.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await eventService.duplicate(selected.id, duplicateDate);
      const duplicatedId = Number(response?.event?.id || 0);
      if (!duplicatedId) throw new Error("A API não retornou a nova edição criada.");

      setShow(false);
      setMessage(response?.message || "Evento duplicado como novo rascunho.");
      navigate(`/event/edit/${duplicatedId}`);
    } catch (err) {
      const dateMessage = Array.isArray(err?.errors?.date) ? err.errors.date[0] : err?.errors?.date;
      setError(dateMessage || err?.message || "Não foi possível duplicar o evento.");
    } finally {
      setBusy(false);
    }
  };

  const openLauncher = () => {
    setMessage("");
    setError("");
    setShow(true);
  };

  return <>
    <Button
      type="button"
      className="cut-event-series-launcher"
      onClick={openLauncher}
      aria-label={isEditMode ? "Duplicar evento" : "Criar agenda em lote"}
      title={isEditMode ? "Duplicar evento" : "Criar agenda em lote"}
    >
      <i className={`${isEditMode ? "fa-regular fa-copy" : "fa-solid fa-calendar-plus"} me-2`} />
      {isEditMode ? "Duplicar evento" : "Criar agenda em lote"}
    </Button>

    {message && <Alert variant="success" dismissible onClose={() => setMessage("")} className="cut-event-series-alert">{message}</Alert>}

    <Modal show={show} onHide={() => !busy && setShow(false)} centered size={isEditMode ? undefined : "lg"}>
      <Modal.Header closeButton={!busy}>
        <Modal.Title>{isEditMode ? "Duplicar evento" : "Criar várias edições"}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className="text-center py-5">
            <Spinner />
            <p className="mt-2 mb-0">{isEditMode ? "Preparando duplicação..." : "Carregando eventos..."}</p>
          </div>
        ) : isEditMode ? (
          <>
            {error && <Alert variant="danger">{error}</Alert>}
            {selected && <>
              <p className="text-secondary">
                Será criada uma nova edição de <strong>{selected.title}</strong> como rascunho. Informações reutilizáveis do evento serão copiadas, enquanto vendas, participantes, passes, check-ins e histórico permanecem separados.
              </p>
              <Form.Group>
                <Form.Label>Nova data *</Form.Label>
                <Form.Control
                  type="date"
                  min={toDateInput(tomorrowDate())}
                  value={duplicateDate}
                  onChange={(event) => {
                    setDuplicateDate(event.target.value);
                    setError("");
                  }}
                  disabled={busy}
                  autoFocus
                />
                <Form.Text>A sugestão inicial usa sete dias após a edição atual, respeitando a data mínima de amanhã.</Form.Text>
              </Form.Group>
            </>}
          </>
        ) : (
          <>
            {error && <Alert variant="danger">{error}</Alert>}
            <Form.Group className="mb-3">
              <Form.Label>Evento modelo</Form.Label>
              <Form.Select value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={busy || events.length === 0}>
                {events.length === 0 && <option value="">Nenhum evento disponível</option>}
                {events.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.start_date ? new Date(item.start_date).toLocaleDateString("pt-BR") : "sem data"}</option>)}
              </Form.Select>
            </Form.Group>
            {selected && <EventSeriesForm event={selected} busy={busy} onSubmit={submit} />}
          </>
        )}
      </Modal.Body>
      {isEditMode && !loading && (
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShow(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={duplicateCurrentEvent} disabled={busy || !selected || !duplicateDate}>
            {busy ? "Duplicando..." : <><i className="fa-regular fa-copy me-2" />Duplicar evento</>}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  </>;
}
