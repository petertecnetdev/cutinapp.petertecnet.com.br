import React, { useEffect, useState } from "react";
import { Alert, Button, Form, Modal, Spinner } from "react-bootstrap";
import { useLocation } from "react-router-dom";
import eventService from "../services/EventService";
import EventSeriesForm from "./EventSeriesForm";

export default function EventSeriesLauncher() {
  const location = useLocation();
  const visible = location.pathname === "/event/manage";
  const [show, setShow] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!show) return;
    setLoading(true);
    setError("");
    eventService.myEvents()
      .then((items) => {
        setEvents(items);
        setEventId((current) => current || (items[0]?.id ? String(items[0].id) : ""));
      })
      .catch((err) => setError(err?.message || "Não foi possível carregar seus eventos."))
      .finally(() => setLoading(false));
  }, [show]);

  if (!visible) return null;
  const selected = events.find((item) => String(item.id) === eventId) || null;

  const submit = async (payload) => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await eventService.series(selected.id, payload);
      setMessage(result?.message || "Novas edições criadas.");
      setShow(false);
      window.dispatchEvent(new CustomEvent("cutinapp:event-series-created", { detail: result }));
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Button
      type="button"
      className="cut-event-series-launcher"
      onClick={() => { setShow(true); setMessage(""); }}
    >
      <i className="fa-solid fa-calendar-plus me-2" />Criar agenda em lote
    </Button>

    {message && <Alert variant="success" dismissible onClose={() => setMessage("")} className="cut-event-series-alert">{message}</Alert>}

    <Modal show={show} onHide={() => !busy && setShow(false)} centered size="lg">
      <Modal.Header closeButton={!busy}><Modal.Title>Criar várias edições</Modal.Title></Modal.Header>
      <Modal.Body>
        {loading ? <div className="text-center py-5"><Spinner /><p className="mt-2 mb-0">Carregando eventos...</p></div> : <>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form.Group className="mb-3">
            <Form.Label>Evento modelo</Form.Label>
            <Form.Select value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={busy || events.length === 0}>
              {events.length === 0 && <option value="">Nenhum evento disponível</option>}
              {events.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.start_date ? new Date(item.start_date).toLocaleDateString("pt-BR") : "sem data"}</option>)}
            </Form.Select>
          </Form.Group>
          {selected && <EventSeriesForm event={selected} busy={busy} onSubmit={submit} />}
        </>}
      </Modal.Body>
    </Modal>
  </>;
}
