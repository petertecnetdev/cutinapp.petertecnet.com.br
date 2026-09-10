import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Container, Form, Spinner } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";
import "./production-agenda.css";

const DAYS = [
  { value: 1, label: "Segunda-feira", short: "SEG" },
  { value: 2, label: "Terça-feira", short: "TER" },
  { value: 3, label: "Quarta-feira", short: "QUA" },
  { value: 4, label: "Quinta-feira", short: "QUI" },
  { value: 5, label: "Sexta-feira", short: "SEX" },
  { value: 6, label: "Sábado", short: "SÁB" },
  { value: 0, label: "Domingo", short: "DOM" },
];

const imageUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
};

const apiError = (error, fallback) => {
  const errors = error?.response?.data?.errors;
  const validation = errors && Object.values(errors).flat().find(Boolean);
  return validation || error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback;
};

const initials = (value = "") => String(value)
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0]?.toUpperCase())
  .join("") || "EV";

const formatEventDate = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const scheduleEvent = (schedule) => schedule?.source_event || (schedule ? {
  id: schedule.source_event_id || null,
  title: schedule.title,
  slug: null,
  image: schedule.image,
  start_date: null,
  end_date: null,
  venue: schedule.venue,
  city: schedule.city,
  uf: schedule.uf,
  is_published: false,
  legacy: true,
} : null);

export default function ProductionAgendaManager() {
  const { productionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [production, setProduction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agendaActive, setAgendaActive] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [availableEvents, setAvailableEvents] = useState([]);
  const [selections, setSelections] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(location.state?.agendaMessage || "");
  const [togglingAgenda, setTogglingAgenda] = useState(false);
  const [savingDay, setSavingDay] = useState(null);
  const [removingDay, setRemovingDay] = useState(null);

  const scheduleByDay = useMemo(() => {
    const result = {};
    [...schedules]
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
      .forEach((schedule) => {
        const key = Number(schedule.day_of_week);
        if (result[key] === undefined) result[key] = schedule;
      });
    return result;
  }, [schedules]);

  const configuredDays = useMemo(
    () => DAYS.filter((day) => Boolean(scheduleByDay[day.value])).length,
    [scheduleByDay]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      cutinappService.productionWorkspace(productionId),
      eventService.agenda(productionId),
    ])
      .then(([workspace, agendaData]) => {
        if (!active) return;
        const loadedSchedules = Array.isArray(agendaData?.schedules) ? agendaData.schedules : [];
        setProduction(workspace?.organization || workspace?.production || null);
        setAgendaActive(agendaData?.agenda?.is_active !== false);
        setSchedules(loadedSchedules);
        setAvailableEvents(Array.isArray(agendaData?.available_events) ? agendaData.available_events : []);

        const nextSelections = {};
        loadedSchedules.forEach((schedule) => {
          const eventId = Number(schedule?.source_event_id || schedule?.source_event?.id || 0);
          if (eventId > 0 && nextSelections[Number(schedule.day_of_week)] === undefined) {
            nextSelections[Number(schedule.day_of_week)] = String(eventId);
          }
        });
        setSelections(nextSelections);
      })
      .catch((err) => active && setError(apiError(err, "Não foi possível carregar a agenda semanal.")))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [productionId]);

  const toggleAgenda = async () => {
    if (togglingAgenda) return;
    const next = !agendaActive;
    setTogglingAgenda(true);
    setError("");
    try {
      const response = await eventService.setAgendaStatus(productionId, next);
      setAgendaActive(response?.agenda?.is_active !== false);
      setSuccess(response?.message || (next ? "Agenda semanal ativada." : "Agenda semanal pausada."));
    } catch (err) {
      setError(apiError(err, "Não foi possível alterar o status da agenda."));
    } finally {
      setTogglingAgenda(false);
    }
  };

  const saveDay = async (day) => {
    const eventId = Number(selections[day.value] || 0);
    if (!eventId || savingDay !== null) {
      if (!eventId) setError(`Escolha um evento para ${day.label.toLowerCase()}.`);
      return;
    }

    setSavingDay(day.value);
    setError("");
    setSuccess("");
    try {
      const response = await eventService.createAgendaItem(productionId, {
        event_id: eventId,
        day_of_week: day.value,
        is_active: true,
      });
      const updated = response?.schedule;
      if (updated?.id) {
        setSchedules((current) => [
          ...current.filter((item) => Number(item.day_of_week) !== Number(day.value)),
          updated,
        ]);
        setSelections((current) => ({ ...current, [day.value]: String(eventId) }));
      }
      setSuccess(response?.message || `${day.label} atualizada na agenda semanal.`);
    } catch (err) {
      setError(apiError(err, "Não foi possível adicionar este evento à agenda semanal."));
    } finally {
      setSavingDay(null);
    }
  };

  const removeDay = async (day, schedule) => {
    if (!schedule?.id || removingDay !== null) return;
    const currentEvent = scheduleEvent(schedule);
    const confirmed = window.confirm(
      `Remover “${currentEvent?.title || "este evento"}” de ${day.label.toLowerCase()}? O evento original não será excluído.`
    );
    if (!confirmed) return;

    setRemovingDay(day.value);
    setError("");
    setSuccess("");
    try {
      const response = await eventService.deleteAgendaItem(schedule.id);
      setSchedules((current) => current.filter((item) => Number(item.id) !== Number(schedule.id)));
      setSelections((current) => {
        const next = { ...current };
        delete next[day.value];
        return next;
      });
      setSuccess(response?.message || "Evento removido da agenda semanal.");
    } catch (err) {
      setError(apiError(err, "Não foi possível remover este evento da agenda."));
    } finally {
      setRemovingDay(null);
    }
  };

  if (loading) {
    return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando agenda semanal" /></div>;
  }

  return (
    <div className="cut-app-page cut-agenda-page">
      <NavlogComponent />
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading cut-agenda-page__heading">
          <div>
            <span className="cut-eyebrow">Agenda da produção</span>
            <h1>Agenda semanal{production?.name ? ` · ${production.name}` : ""}</h1>
            <p>Defina a programação fixa de segunda a domingo escolhendo eventos que já foram criados nesta produção.</p>
          </div>
          <div className="cut-agenda-page__heading-actions">
            <Button variant="outline-light" onClick={() => navigate("/production/mine")}>
              <i className="fa-solid fa-arrow-left me-2" />Minhas produções
            </Button>
            <Button onClick={() => navigate("/event/create")}>
              <i className="fa-solid fa-calendar-plus me-2" />Criar novo evento
            </Button>
          </div>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

        <section className={`cut-agenda-control ${agendaActive ? "is-active" : "is-paused"}`}>
          <div className="cut-agenda-control__status">
            <div className="cut-agenda-control__icon"><i className="fa-solid fa-calendar-week" /></div>
            <div>
              <div className="cut-agenda-control__headline">
                <h3>Agenda semanal</h3>
                <Badge bg={agendaActive ? "success" : "secondary"}>{agendaActive ? "Ativa" : "Pausada"}</Badge>
              </div>
              <p>{configuredDays} de 7 dia(s) configurado(s). A agenda usa os eventos reais da produção como programação fixa.</p>
            </div>
          </div>
          <div className="cut-agenda-control__actions">
            <Form.Check
              type="switch"
              id={`agenda-status-${productionId}`}
              checked={agendaActive}
              disabled={togglingAgenda}
              onChange={toggleAgenda}
              label={agendaActive ? "Agenda ligada" : "Agenda desligada"}
            />
            {production?.slug && (
              <Button variant="outline-light" onClick={() => navigate(`/agenda/${production.slug}`)}>
                <i className="fa-regular fa-eye me-2" />Ver agenda pública
              </Button>
            )}
          </div>
        </section>

        <div className="cut-agenda-help">
          <i className="fa-regular fa-lightbulb" />
          <div>
            <strong>Um dia, um evento fixo</strong>
            <span>Escolha um evento já criado para cada dia da semana. Alterar ou remover um slot da agenda não exclui o evento original.</span>
          </div>
        </div>

        {availableEvents.length === 0 && (
          <Alert variant="info" className="cut-weekly-agenda-no-events">
            <div>
              <strong>Crie seu primeiro evento antes de montar a agenda.</strong>
              <span>A agenda semanal usa somente eventos já cadastrados nesta produção.</span>
            </div>
            <Button size="sm" onClick={() => navigate("/event/create")}>Criar evento</Button>
          </Alert>
        )}

        <div className="cut-agenda-section-heading cut-agenda-list-heading">
          <div>
            <span>Programação fixa</span>
            <h3>Segunda a domingo</h3>
          </div>
          <span className="cut-weekly-agenda-counter">{configuredDays}/7 configurados</span>
        </div>

        <div className="cut-weekly-agenda-grid">
          {DAYS.map((day) => {
            const schedule = scheduleByDay[day.value] || null;
            const currentEvent = scheduleEvent(schedule);
            const selectedId = String(selections[day.value] || currentEvent?.id || "");
            const hasCurrentInOptions = currentEvent?.id
              && !availableEvents.some((event) => Number(event.id) === Number(currentEvent.id));
            const busy = savingDay === day.value || removingDay === day.value;

            return (
              <Card key={day.value} className={`cut-weekly-agenda-day ${schedule ? "is-configured" : "is-empty"}`}>
                <Card.Body>
                  <div className="cut-weekly-agenda-day__header">
                    <div className="cut-weekly-agenda-day__badge">
                      <strong>{day.short}</strong>
                      <span>{day.label}</span>
                    </div>
                    <Badge bg={schedule ? "success" : "secondary"}>{schedule ? "Configurado" : "Livre"}</Badge>
                  </div>

                  {currentEvent && (
                    <div className="cut-weekly-agenda-current">
                      <div className="cut-weekly-agenda-current__image">
                        {currentEvent.image
                          ? <img src={imageUrl(currentEvent.image)} alt="" />
                          : <span>{initials(currentEvent.title)}</span>}
                      </div>
                      <div className="cut-weekly-agenda-current__content">
                        <span className="cut-weekly-agenda-current__eyebrow">Evento atual</span>
                        <strong>{currentEvent.title}</strong>
                        <small>
                          {[formatEventDate(currentEvent.start_date), currentEvent.venue, currentEvent.city].filter(Boolean).join(" · ")
                            || (currentEvent.legacy ? "Item antigo da agenda" : "Evento da produção")}
                        </small>
                      </div>
                    </div>
                  )}

                  <Form.Group className="cut-weekly-agenda-select">
                    <Form.Label>{schedule ? "Trocar evento deste dia" : "Escolher evento para este dia"}</Form.Label>
                    <Form.Select
                      value={selectedId}
                      disabled={availableEvents.length === 0 || busy}
                      onChange={(event) => setSelections((current) => ({ ...current, [day.value]: event.target.value }))}
                    >
                      <option value="">Selecione um evento...</option>
                      {hasCurrentInOptions && currentEvent?.id && (
                        <option value={String(currentEvent.id)}>{currentEvent.title} (atual)</option>
                      )}
                      {availableEvents.map((event) => (
                        <option key={event.id} value={String(event.id)}>
                          {event.title}{formatEventDate(event.start_date) ? ` · ${formatEventDate(event.start_date)}` : ""}
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>

                  <div className="cut-weekly-agenda-day__actions">
                    <Button
                      size="sm"
                      disabled={!selectedId || busy}
                      onClick={() => saveDay(day)}
                    >
                      {savingDay === day.value
                        ? <><Spinner size="sm" className="me-2" />Salvando...</>
                        : <><i className="fa-solid fa-check me-2" />{schedule ? "Salvar alteração" : "Adicionar à agenda"}</>}
                    </Button>

                    {currentEvent?.id && (
                      <Button
                        size="sm"
                        variant="outline-light"
                        onClick={() => navigate(`/event/edit/${currentEvent.id}`)}
                        disabled={busy}
                      >
                        <i className="fa-regular fa-pen-to-square me-2" />Editar evento
                      </Button>
                    )}

                    {schedule && (
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => removeDay(day, schedule)}
                        disabled={busy}
                        aria-label={`Remover evento de ${day.label}`}
                      >
                        {removingDay === day.value ? <Spinner size="sm" /> : <i className="fa-regular fa-trash-can" />}
                      </Button>
                    )}
                  </div>
                </Card.Body>
              </Card>
            );
          })}
        </div>
      </Container>
    </div>
  );
}
