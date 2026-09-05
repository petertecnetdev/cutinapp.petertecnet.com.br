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
  { value: 1, label: "Segunda-feira", short: "Seg" },
  { value: 2, label: "Terça-feira", short: "Ter" },
  { value: 3, label: "Quarta-feira", short: "Qua" },
  { value: 4, label: "Quinta-feira", short: "Qui" },
  { value: 5, label: "Sexta-feira", short: "Sex" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 0, label: "Domingo", short: "Dom" },
];

const DAY_ORDER = DAYS.reduce((result, day, index) => ({ ...result, [day.value]: index }), {});
const dayInfo = (value) => DAYS.find((day) => day.value === Number(value)) || DAYS[0];

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

const formatNextDate = (event) => {
  if (!event?.start_date) return "";
  const date = new Date(event.start_date);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export default function ProductionAgendaManager() {
  const { productionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [production, setProduction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agendaActive, setAgendaActive] = useState(true);
  const [schedules, setSchedules] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(location.state?.agendaMessage || "");
  const [togglingAgenda, setTogglingAgenda] = useState(false);
  const [togglingItemId, setTogglingItemId] = useState(null);
  const [generatingItemId, setGeneratingItemId] = useState(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);

  const sortedSchedules = useMemo(() => [...schedules].sort((a, b) => {
    const day = (DAY_ORDER[Number(a.day_of_week)] ?? 99) - (DAY_ORDER[Number(b.day_of_week)] ?? 99);
    if (day !== 0) return day;
    return String(a.start_time || "").localeCompare(String(b.start_time || ""));
  }), [schedules]);

  const activeCount = useMemo(() => schedules.filter((item) => item.is_active).length, [schedules]);

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
        setProduction(workspace?.organization || workspace?.production || null);
        setAgendaActive(agendaData?.agenda?.is_active !== false);
        setSchedules(Array.isArray(agendaData?.schedules) ? agendaData.schedules : []);
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
      setSuccess(response?.message || (next ? "Agenda ativada." : "Agenda pausada."));
    } catch (err) {
      setError(apiError(err, "Não foi possível alterar o status da agenda."));
    } finally {
      setTogglingAgenda(false);
    }
  };

  const toggleItem = async (schedule) => {
    if (togglingItemId) return;
    setTogglingItemId(schedule.id);
    setError("");
    try {
      const response = await eventService.setAgendaItemStatus(schedule.id, !schedule.is_active);
      const updated = response?.schedule;
      if (updated?.id) setSchedules((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSuccess(response?.message || "Status atualizado.");
    } catch (err) {
      setError(apiError(err, "Não foi possível alterar este evento da agenda."));
    } finally {
      setTogglingItemId(null);
    }
  };

  const generateItem = async (schedule) => {
    if (generatingItemId) return;
    setGeneratingItemId(schedule.id);
    setError("");
    setSuccess("");
    setLastEvent(null);
    try {
      const response = await eventService.generateAgendaItem(schedule.id);
      setLastEvent(response?.event || null);
      setSuccess(response?.message || "Próxima ocorrência criada.");
    } catch (err) {
      setError(apiError(err, "Não foi possível criar a próxima ocorrência."));
    } finally {
      setGeneratingItemId(null);
    }
  };

  const generateAll = async () => {
    if (generatingAll) return;
    setGeneratingAll(true);
    setError("");
    setSuccess("");
    setLastEvent(null);
    try {
      const response = await eventService.generateAgendaUpcoming(productionId);
      const events = Array.isArray(response?.events) ? response.events : [];
      setLastEvent(events.length === 1 ? events[0] : null);
      setSuccess(response?.message || "Próximos eventos preparados.");
    } catch (err) {
      setError(apiError(err, "Não foi possível gerar os próximos eventos."));
    } finally {
      setGeneratingAll(false);
    }
  };

  const remove = async (schedule) => {
    if (deletingId) return;
    const confirmed = window.confirm(`Remover “${schedule.title}” da agenda semanal? Os eventos já criados não serão apagados.`);
    if (!confirmed) return;

    setDeletingId(schedule.id);
    setError("");
    try {
      const response = await eventService.deleteAgendaItem(schedule.id);
      setSchedules((current) => current.filter((item) => item.id !== schedule.id));
      setSuccess(response?.message || "Evento removido da agenda.");
    } catch (err) {
      setError(apiError(err, "Não foi possível remover este evento da agenda."));
    } finally {
      setDeletingId(null);
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
            <span className="cut-eyebrow">Agenda recorrente</span>
            <h1>Agenda semanal{production?.name ? ` · ${production.name}` : ""}</h1>
            <p>Organize os eventos fixos da produção e gere as próximas edições sem preencher tudo novamente.</p>
          </div>
          <div className="cut-agenda-page__heading-actions">
            <Button variant="outline-light" onClick={() => navigate("/production/mine")}>
              <i className="fa-solid fa-arrow-left me-2" />Minhas produções
            </Button>
            <Button onClick={() => navigate(`/production/${productionId}/agenda/new`)}>
              <i className="fa-solid fa-plus me-2" />Novo evento fixo
            </Button>
          </div>
        </div>

        {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
        {success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

        {lastEvent?.id && (
          <Alert variant="info" className="cut-agenda-created-alert">
            <div>
              <strong>{lastEvent.title}</strong>
              <span>{formatNextDate(lastEvent) ? `Criado para ${formatNextDate(lastEvent)}. ` : ""}Ele é um evento normal em rascunho e pode ser editado antes da publicação.</span>
            </div>
            <div className="cut-agenda-created-alert__actions">
              <Button size="sm" variant="outline-info" onClick={() => navigate(`/event/edit/${lastEvent.id}`)}>Editar evento</Button>
              <Button size="sm" onClick={() => navigate(`/ticket/create?eventId=${lastEvent.id}`)}>Configurar ingressos</Button>
            </div>
          </Alert>
        )}

        <section className={`cut-agenda-control ${agendaActive ? "is-active" : "is-paused"}`}>
          <div className="cut-agenda-control__status">
            <div className="cut-agenda-control__icon"><i className="fa-solid fa-calendar-days" /></div>
            <div>
              <div className="cut-agenda-control__headline">
                <h3>Agenda da produção</h3>
                <Badge bg={agendaActive ? "success" : "secondary"}>{agendaActive ? "Ativa" : "Pausada"}</Badge>
              </div>
              <p>{agendaActive ? `${activeCount} evento(s) fixo(s) ativo(s) prontos para gerar as próximas edições.` : "A agenda está pausada. Nenhuma ocorrência pode ser gerada até ser reativada."}</p>
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
            <Button onClick={generateAll} disabled={!agendaActive || activeCount === 0 || generatingAll}>
              {generatingAll ? <><Spinner size="sm" className="me-2" />Gerando...</> : <><i className="fa-solid fa-wand-magic-sparkles me-2" />Criar próximos eventos</>}
            </Button>
          </div>
        </section>

        <div className="cut-agenda-help">
          <i className="fa-regular fa-lightbulb" />
          <div>
            <strong>Agenda é o modelo, evento é a ocorrência</strong>
            <span>Cada item abaixo guarda a rotina semanal. Ao gerar uma edição, a Cutinapp cria um evento normal em rascunho que pode receber lineup, ingressos, imagem e qualquer ajuste específico daquela data.</span>
          </div>
        </div>

        <div className="cut-agenda-section-heading cut-agenda-list-heading">
          <div>
            <span>Programação fixa</span>
            <h3>{schedules.length ? `${schedules.length} evento(s) na semana` : "Sua agenda ainda está vazia"}</h3>
          </div>
          <Button variant="outline-light" size="sm" onClick={() => navigate(`/production/${productionId}/agenda/new`)}>
            <i className="fa-solid fa-plus me-2" />Novo evento fixo
          </Button>
        </div>

        {schedules.length === 0 ? (
          <div className="cut-agenda-empty">
            <div className="cut-agenda-empty__icon"><i className="fa-regular fa-calendar-plus" /></div>
            <h3>Cadastre a rotina da sua produção</h3>
            <p>Exemplo: toda sexta às 22h e todo sábado às 20h. Cada cadastro será feito em uma página própria, com todos os campos do evento.</p>
            <Button onClick={() => navigate(`/production/${productionId}/agenda/new`)}>Cadastrar primeiro evento fixo</Button>
          </div>
        ) : (
          <div className="cut-agenda-grid">
            {sortedSchedules.map((schedule) => {
              const day = dayInfo(schedule.day_of_week);
              const busy = generatingItemId === schedule.id || togglingItemId === schedule.id || deletingId === schedule.id;
              return (
                <Card key={schedule.id} className={`cut-agenda-item ${schedule.is_active ? "is-active" : "is-paused"}`}>
                  {schedule.image && <div className="cut-agenda-item__image" style={{ backgroundImage: `url(${imageUrl(schedule.image)})` }} />}
                  <Card.Body>
                    <div className="cut-agenda-item__top">
                      <div className="cut-agenda-day"><strong>{day.short}</strong><span>{String(schedule.start_time || "").slice(0, 5)}</span></div>
                      <Form.Check
                        type="switch"
                        id={`agenda-item-${schedule.id}`}
                        checked={Boolean(schedule.is_active)}
                        disabled={Boolean(togglingItemId)}
                        onChange={() => toggleItem(schedule)}
                        label={schedule.is_active ? "Ativo" : "Pausado"}
                      />
                    </div>
                    <h4>{schedule.title}</h4>
                    <p>{schedule.description}</p>
                    <div className="cut-agenda-item__meta">
                      <span><i className="fa-regular fa-clock" />{String(schedule.start_time || "").slice(0, 5)} – {String(schedule.end_time || "").slice(0, 5)}</span>
                      {(schedule.venue || schedule.city) && <span><i className="fa-solid fa-location-dot" />{[schedule.venue, schedule.city].filter(Boolean).join(" · ")}</span>}
                      <span><i className="fa-solid fa-repeat" />Toda {day.label.toLowerCase()}</span>
                    </div>
                    <div className="cut-agenda-item__actions">
                      <Button size="sm" onClick={() => generateItem(schedule)} disabled={!agendaActive || !schedule.is_active || busy}>
                        {generatingItemId === schedule.id ? <Spinner size="sm" /> : <i className="fa-solid fa-wand-magic-sparkles" />}<span>Criar próxima edição</span>
                      </Button>
                      <Button size="sm" variant="outline-light" onClick={() => navigate(`/production/${productionId}/agenda/${schedule.id}/edit`)} disabled={busy}>
                        <i className="fa-regular fa-pen-to-square" /><span>Editar</span>
                      </Button>
                      <Button size="sm" variant="outline-danger" onClick={() => remove(schedule)} disabled={busy} aria-label={`Remover ${schedule.title}`}>
                        <i className="fa-regular fa-trash-can" />
                      </Button>
                    </div>
                  </Card.Body>
                </Card>
              );
            })}
          </div>
        )}
      </Container>
    </div>
  );
}
