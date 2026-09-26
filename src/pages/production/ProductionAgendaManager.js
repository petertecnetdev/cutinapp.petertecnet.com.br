import { showConfirmation } from "../../utils/sweetAlert";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Container, Form, Modal, Spinner } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EventPosterThumbnail from "../../components/event/EventPosterThumbnail";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";
import "./production-agenda.css";
import "./production-agenda-weekly-picker.css";

const DAYS = [
  { value: 1, label: "Segunda-feira", short: "SEG" },
  { value: 2, label: "Terça-feira", short: "TER" },
  { value: 3, label: "Quarta-feira", short: "QUA" },
  { value: 4, label: "Quinta-feira", short: "QUI" },
  { value: 5, label: "Sexta-feira", short: "SEX" },
  { value: 6, label: "Sábado", short: "SÁB" },
  { value: 0, label: "Domingo", short: "DOM" },
];

const defaultStrategy = (schedule = null) => ({
  generation_mode: schedule?.generation_mode === "delayed" ? "delayed" : "immediate",
  generation_delay_days: Math.max(1, Math.min(6, Number(schedule?.generation_delay_days || 1))),
  generation_weeks: Math.max(1, Math.min(52, Number(schedule?.generation_weeks || 1))),
  interval_weeks: Math.max(1, Math.min(52, Number(schedule?.interval_weeks || 1))),
});

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
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
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
  const [strategies, setStrategies] = useState({});
  const [availableEvents, setAvailableEvents] = useState([]);
  const [selections, setSelections] = useState({});
  const [pickerDay, setPickerDay] = useState(null);
  const [pickerSearch, setPickerSearch] = useState("");
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

  const filteredEvents = useMemo(() => {
    const query = pickerSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return availableEvents;
    return availableEvents.filter((event) => [event.title, event.venue, event.city, event.uf]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(query)));
  }, [availableEvents, pickerSearch]);

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
        const nextStrategies = {};
        loadedSchedules.forEach((schedule) => {
          const day = Number(schedule.day_of_week);
          const eventId = Number(schedule?.source_event_id || schedule?.source_event?.id || 0);
          if (eventId > 0 && nextSelections[day] === undefined) nextSelections[day] = String(eventId);
          if (nextStrategies[day] === undefined) nextStrategies[day] = defaultStrategy(schedule);
        });
        setSelections(nextSelections);
        setStrategies(nextStrategies);
      })
      .catch((err) => active && setError(apiError(err, "Não foi possível carregar a agenda semanal.")))
      .finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [productionId]);

  const openPicker = (day) => {
    setPickerSearch("");
    setPickerDay(day);
  };

  const closePicker = () => {
    setPickerDay(null);
    setPickerSearch("");
  };

  const chooseEvent = (event) => {
    if (!pickerDay || !event?.id) return;
    setSelections((current) => ({ ...current, [pickerDay.value]: String(event.id) }));
    closePicker();
  };

  const createEventForDay = (day = pickerDay) => {
    if (!day) return;
    navigate(`/event/create?productionId=${encodeURIComponent(String(productionId))}`, {
      state: {
        agendaReturnTo: `/production/${productionId}/agenda`,
        agendaDay: day.value,
        agendaDayLabel: day.label,
      },
    });
  };

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
      const strategy = strategies[day.value] || defaultStrategy();
      const response = await eventService.createAgendaItem(productionId, {
        event_id: eventId,
        day_of_week: day.value,
        generation_mode: strategy.generation_mode,
        generation_delay_days: Number(strategy.generation_delay_days),
        generation_weeks: Number(strategy.generation_weeks),
        interval_weeks: Number(strategy.interval_weeks),
        is_active: true,
      });
      const updated = response?.schedule;
      if (updated?.id) {
        setSchedules((current) => [
          ...current.filter((item) => Number(item.day_of_week) !== Number(day.value)),
          updated,
        ]);
        setSelections((current) => ({ ...current, [day.value]: String(eventId) }));
        setStrategies((current) => ({ ...current, [day.value]: defaultStrategy(updated) }));
      }
      const created = Number(response?.generation?.created_count || 0);
      setSuccess(created > 0
        ? `${day.label} configurada. ${created} nova(s) ocorrência(s) criada(s).`
        : response?.message || `${day.label} atualizada na agenda semanal.`);
    } catch (err) {
      setError(apiError(err, "Não foi possível adicionar este evento à agenda semanal."));
    } finally {
      setSavingDay(null);
    }
  };

  const removeDay = async (day, schedule) => {
    if (!schedule?.id || removingDay !== null) return;
    const currentEvent = scheduleEvent(schedule);
    const confirmed = await showConfirmation({
      title: "Remover da agenda?",
      text: `Remover “${currentEvent?.title || "este evento"}” de ${day.label.toLowerCase()}? O evento original não será excluído.`,
      confirmButtonText: "Remover da agenda",
    });
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
      setStrategies((current) => {
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
            <p>Escolha um evento para cada dia e defina de quantas em quantas semanas uma nova edição deve ser criada.</p>
          </div>
          <div className="cut-agenda-page__heading-actions">
            <Button variant="outline-light" onClick={() => navigate("/production/mine")}>
              <i className="fa-solid fa-arrow-left me-2" />Minhas produções
            </Button>
            <Button onClick={() => navigate(`/event/create?productionId=${encodeURIComponent(String(productionId))}`)}>
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
              <p>{configuredDays} de 7 dias configurados. Cada dia pode ter um evento e um intervalo de repetição diferentes.</p>
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
            <strong>Uma programação diferente para cada dia</strong>
            <span>Clique em um dia, escolha um evento já cadastrado ou crie um novo e defina a recorrência. Ex.: todo sábado, a cada 2 semanas ou a cada 4 semanas.</span>
          </div>
        </div>

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
            const selectedEvent = availableEvents.find((event) => String(event.id) === selectedId) || currentEvent || null;
            const busy = savingDay === day.value || removingDay === day.value;
            const strategy = strategies[day.value] || defaultStrategy(schedule);
            const updateStrategy = (patch) => setStrategies((current) => ({
              ...current,
              [day.value]: { ...strategy, ...patch },
            }));

            return (
              <Card key={day.value} className={`cut-weekly-agenda-day cut-weekly-agenda-day--picker ${schedule ? "is-configured" : "is-empty"}`}>
                <Card.Body>
                  <button type="button" className="cut-weekly-agenda-day__open" onClick={() => openPicker(day)} aria-label={`Escolher evento para ${day.label}`}>
                    <div className="cut-weekly-agenda-day__header">
                      <div className="cut-weekly-agenda-day__badge">
                        <strong>{day.short}</strong>
                        <span>{day.label}</span>
                      </div>
                      <Badge bg={schedule ? "success" : selectedEvent ? "primary" : "secondary"}>
                        {schedule ? "Configurado" : selectedEvent ? "Selecionado" : "Livre"}
                      </Badge>
                    </div>

                    {selectedEvent ? (
                      <div className="cut-weekly-agenda-current">
                        <div className="cut-weekly-agenda-current__image">
                          <EventPosterThumbnail image={selectedEvent.image} title={selectedEvent.title} alt="" className="cut-weekly-agenda-current__poster" loading="lazy" />
                        </div>
                        <div className="cut-weekly-agenda-current__content">
                          <span className="cut-weekly-agenda-current__eyebrow">Evento deste dia</span>
                          <strong>{selectedEvent.title}</strong>
                          <small>{[formatEventDate(selectedEvent.start_date), selectedEvent.venue, selectedEvent.city].filter(Boolean).join(" · ")}</small>
                        </div>
                        <i className="fa-solid fa-chevron-right cut-weekly-agenda-current__chevron" />
                      </div>
                    ) : (
                      <div className="cut-weekly-agenda-empty-choice">
                        <span className="cut-weekly-agenda-empty-choice__icon"><i className="fa-solid fa-plus" /></span>
                        <span><strong>Escolher evento</strong><small>Abra a lista de eventos desta produção</small></span>
                      </div>
                    )}
                  </button>

                  <Button type="button" variant="outline-light" className="cut-weekly-agenda-pick-button" onClick={() => openPicker(day)} disabled={busy}>
                    <i className="fa-regular fa-images me-2" />{selectedEvent ? "Trocar evento" : "Escolher evento"}
                  </Button>

                  <div className="cut-weekly-agenda-strategy cut-weekly-agenda-strategy--recurrence">
                    <Form.Group>
                      <Form.Label>Repetir a cada</Form.Label>
                      <Form.Select
                        value={strategy.interval_weeks}
                        disabled={busy}
                        onChange={(event) => updateStrategy({ interval_weeks: Math.max(1, Math.min(52, Number(event.target.value) || 1)) })}
                      >
                        {[1,2,3,4,6,8,12,16,26,52].map((weeks) => (
                          <option key={weeks} value={weeks}>{weeks === 1 ? "Toda semana" : `${weeks} semanas`}</option>
                        ))}
                      </Form.Select>
                    </Form.Group>

                    <Form.Group>
                      <Form.Label>Ocorrências futuras</Form.Label>
                      <Form.Control
                        type="number"
                        min={1}
                        max={52}
                        value={strategy.generation_weeks}
                        disabled={busy}
                        onChange={(event) => updateStrategy({ generation_weeks: Math.max(1, Math.min(52, Number(event.target.value) || 1)) })}
                      />
                      <Form.Text>Quantas edições manter preparadas.</Form.Text>
                    </Form.Group>

                    <Form.Group>
                      <Form.Label>Criação</Form.Label>
                      <Form.Select
                        value={strategy.generation_mode}
                        disabled={busy}
                        onChange={(event) => updateStrategy({ generation_mode: event.target.value })}
                      >
                        <option value="immediate">Criar antecipadamente</option>
                        <option value="delayed">Criar após o evento anterior</option>
                      </Form.Select>
                    </Form.Group>

                    {strategy.generation_mode === "delayed" && (
                      <Form.Group>
                        <Form.Label>Esperar após o evento</Form.Label>
                        <Form.Select
                          value={strategy.generation_delay_days}
                          disabled={busy}
                          onChange={(event) => updateStrategy({ generation_delay_days: Number(event.target.value) })}
                        >
                          {[1,2,3,4,5,6].map((days) => (
                            <option key={days} value={days}>{days} dia{days > 1 ? "s" : ""}</option>
                          ))}
                        </Form.Select>
                      </Form.Group>
                    )}
                  </div>

                  <div className="cut-weekly-agenda-day__actions">
                    <Button size="sm" disabled={!selectedId || busy} onClick={() => saveDay(day)}>
                      {savingDay === day.value
                        ? <><Spinner size="sm" className="me-2" />Salvando...</>
                        : <><i className="fa-solid fa-check me-2" />{schedule ? "Salvar alterações" : "Adicionar à agenda"}</>}
                    </Button>

                    {selectedEvent?.id && (
                      <Button size="sm" variant="outline-light" onClick={() => navigate(`/event/edit/${selectedEvent.id}`)} disabled={busy}>
                        <i className="fa-regular fa-pen-to-square me-2" />Editar evento
                      </Button>
                    )}

                    {schedule && (
                      <Button size="sm" variant="outline-danger" onClick={() => removeDay(day, schedule)} disabled={busy} aria-label={`Remover evento de ${day.label}`}>
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

      <Modal show={Boolean(pickerDay)} onHide={closePicker} centered size="lg" contentClassName="cut-agenda-picker-modal" backdropClassName="cut-agenda-picker-backdrop">
        <Modal.Body>
          <div className="cut-agenda-picker__head">
            <div>
              <span className="cut-eyebrow">{pickerDay?.label}</span>
              <h2>Escolher evento</h2>
              <p>O evento selecionado será o modelo usado para criar as próximas edições deste dia.</p>
            </div>
            <Button variant="outline-light" className="cut-agenda-picker__close" onClick={closePicker} aria-label="Fechar seletor">
              <i className="fa-solid fa-xmark" />
            </Button>
          </div>

          <div className="cut-agenda-picker__toolbar">
            <div className="cut-agenda-picker__search">
              <i className="fa-solid fa-magnifying-glass" />
              <Form.Control value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Buscar por nome, local ou cidade" autoFocus />
            </div>
            <Button onClick={() => createEventForDay()}>
              <i className="fa-solid fa-plus me-2" />Criar novo evento
            </Button>
          </div>

          {filteredEvents.length > 0 ? (
            <div className="cut-agenda-picker__events" role="listbox" aria-label={`Eventos para ${pickerDay?.label || "o dia"}`}>
              {filteredEvents.map((event) => {
                const selected = String(selections[pickerDay?.value] || "") === String(event.id);
                return (
                  <button key={event.id} type="button" className={`cut-agenda-picker-event ${selected ? "is-selected" : ""}`} onClick={() => chooseEvent(event)} role="option" aria-selected={selected}>
                    <span className="cut-agenda-picker-event__cover">
                      <EventPosterThumbnail image={event.image} title={event.title} alt="" className="cut-agenda-picker-event__poster" loading="lazy" />
                    </span>
                    <span className="cut-agenda-picker-event__body">
                      <strong>{event.title}</strong>
                      <span><i className="fa-regular fa-calendar" />{formatEventDate(event.start_date)}</span>
                      {(event.venue || event.city) && <span><i className="fa-solid fa-location-dot" />{[event.venue, event.city].filter(Boolean).join(" · ")}</span>}
                    </span>
                    <span className="cut-agenda-picker-event__select">
                      <i className={selected ? "fa-solid fa-circle-check" : "fa-regular fa-circle"} />
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="cut-agenda-picker__empty">
              <i className="fa-regular fa-calendar-plus" />
              <strong>{availableEvents.length ? "Nenhum evento encontrado" : "Ainda não há eventos nesta produção"}</strong>
              <span>{availableEvents.length ? "Tente outro termo de busca." : "Crie o primeiro evento e depois vincule-o a este dia da semana."}</span>
              <Button onClick={() => createEventForDay()}>Criar novo evento</Button>
            </div>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}
