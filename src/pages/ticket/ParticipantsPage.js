import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Table } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import "./ParticipantsPage.css";

const INVALID_STATUSES = new Set(["cancelled", "refunded", "charged_back"]);

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
};

const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("pt-BR");

const participantInitials = (pass) => {
  const name = pass?.holder_name || [pass?.user?.first_name, pass?.user?.last_name].filter(Boolean).join(" ");
  return String(name || "P")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "P";
};

const participantName = (pass) => pass?.holder_name
  || [pass?.user?.first_name, pass?.user?.last_name].filter(Boolean).join(" ")
  || "Participante";

const participantEmail = (pass) => pass?.holder_email || pass?.user?.email || "";

const passState = (pass) => {
  if (pass?.checked_in_at || String(pass?.status || "") === "checked_in") return "checked";
  if (INVALID_STATUSES.has(String(pass?.status || ""))) return "invalid";
  return "valid";
};

const passStateLabel = (pass) => {
  const state = passState(pass);
  if (state === "checked") return "Check-in realizado";
  if (state === "invalid") {
    return {
      cancelled: "Cancelado",
      refunded: "Reembolsado",
      charged_back: "Pagamento contestado",
    }[String(pass?.status || "")] || "Inválido";
  }
  return "Válido";
};

const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function ParticipantsPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();

  const [passes, setPasses] = useState([]);
  const [event, setEvent] = useState(null);
  const [stats, setStats] = useState({ issued: 0, checked_in: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ticketFilter, setTicketFilter] = useState("all");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    cutinappService.eventParticipants(eventId)
      .then((response) => {
        if (!active) return;
        setPasses(Array.isArray(response?.passes) ? response.passes : []);
        setEvent(response?.event || null);
        setStats({
          issued: Number(response?.stats?.issued || 0),
          checked_in: Number(response?.stats?.checked_in || 0),
        });
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || "Não foi possível carregar os participantes.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  const ticketOptions = useMemo(() => {
    const names = new Set();
    passes.forEach((pass) => {
      const name = String(pass?.ticket?.name || "Cortesia").trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [passes]);

  const filtered = useMemo(() => {
    const q = normalize(query);

    return passes.filter((pass) => {
      const state = passState(pass);
      if (statusFilter !== "all" && state !== statusFilter) return false;

      const ticketName = String(pass?.ticket?.name || "Cortesia");
      if (ticketFilter !== "all" && ticketName !== ticketFilter) return false;

      if (!q) return true;

      return normalize([
        participantName(pass),
        participantEmail(pass),
        ticketName,
        pass?.id,
      ].join(" ")).includes(q);
    });
  }, [passes, query, statusFilter, ticketFilter]);

  const issued = Math.max(0, Number(stats.issued || 0));
  const checkedIn = Math.max(0, Number(stats.checked_in || 0));
  const waiting = Math.max(0, issued - checkedIn);
  const invalidCount = passes.filter((pass) => passState(pass) === "invalid").length;
  const attendanceRate = issued > 0 ? Math.round((checkedIn / issued) * 100) : 0;

  const exportCsv = () => {
    const rows = [
      ["Participante", "E-mail", "Ingresso", "Emitido", "Status", "Check-in"],
      ...filtered.map((pass) => [
        participantName(pass),
        participantEmail(pass),
        pass?.ticket?.name || "Cortesia",
        formatDateTime(pass?.created_at),
        passStateLabel(pass),
        formatDateTime(pass?.checked_in_at),
      ]),
    ];

    const csv = rows.map((row) => row.map(escapeCsv).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `participantes-${event?.slug || eventId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/event/manage");
  };

  return (
    <div className="cut-app-page cut-participants-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Carregando participantes" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-participants-topbar">
          <Button type="button" variant="outline-light" className="cut-participants-back" onClick={goBack}>
            <i className="fa-solid fa-arrow-left" />
            <span>Voltar</span>
          </Button>

          <div className="cut-participants-top-actions">
            <Button type="button" variant="outline-light" onClick={() => navigate("/event/manage")}>
              <i className="fa-regular fa-calendar" />
              <span>Meus eventos</span>
            </Button>
            <Button type="button" variant="outline-light" onClick={() => navigate(`/event/edit/${eventId}`)}>
              <i className="fa-solid fa-pen" />
              <span>Gerenciar evento</span>
            </Button>
            {event?.is_published && (
              <Button type="button" onClick={() => navigate(`/checkin?eventId=${eventId}`)}>
                <i className="fa-solid fa-qrcode" />
                <span>Abrir portaria</span>
              </Button>
            )}
          </div>
        </div>

        <div className="cut-page-heading cut-participants-heading">
          <div>
            <span className="cut-eyebrow">Gestão de participantes</span>
            <h1>{event?.title || "Participantes do evento"}</h1>
            <p>
              Acompanhe quem recebeu ingresso, quem já entrou no evento e encontre rapidamente qualquer participante.
              Esta tela é a lista operacional do produtor; a validação de entrada acontece em <strong>Portaria / check-in</strong>.
            </p>
          </div>
        </div>

        {error && (
          <Alert variant="danger" dismissible onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Row className="g-3 mb-4">
          <Col sm={6} xl={3}>
            <Card className="cut-panel cut-participant-kpi h-100">
              <Card.Body>
                <span className="cut-participant-kpi__icon"><i className="fa-solid fa-ticket" /></span>
                <small>Ingressos válidos</small>
                <strong>{issued}</strong>
                <span>Total emitido para este evento</span>
              </Card.Body>
            </Card>
          </Col>
          <Col sm={6} xl={3}>
            <Card className="cut-panel cut-participant-kpi h-100">
              <Card.Body>
                <span className="cut-participant-kpi__icon"><i className="fa-solid fa-circle-check" /></span>
                <small>Check-ins</small>
                <strong>{checkedIn}</strong>
                <span>Pessoas que já entraram</span>
              </Card.Body>
            </Card>
          </Col>
          <Col sm={6} xl={3}>
            <Card className="cut-panel cut-participant-kpi h-100">
              <Card.Body>
                <span className="cut-participant-kpi__icon"><i className="fa-regular fa-clock" /></span>
                <small>Aguardando entrada</small>
                <strong>{waiting}</strong>
                <span>Ingressos ainda não utilizados</span>
              </Card.Body>
            </Card>
          </Col>
          <Col sm={6} xl={3}>
            <Card className="cut-panel cut-participant-kpi h-100">
              <Card.Body>
                <span className="cut-participant-kpi__icon"><i className="fa-solid fa-chart-line" /></span>
                <small>Taxa de presença</small>
                <strong>{attendanceRate}%</strong>
                <span>{invalidCount > 0 ? `${invalidCount} ingresso(s) inválido(s)` : "Sem ingressos inválidos"}</span>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Card className="cut-panel cut-participants-workspace">
          <Card.Body className="p-3 p-lg-4">
            <div className="cut-participants-workspace-head">
              <div>
                <span className="cut-eyebrow">Lista operacional</span>
                <h2 className="cut-section-title mb-1">Participantes e ingressos</h2>
                <p className="mb-0">Pesquise, filtre e abra o perfil de quem está vinculado a uma conta da Cutinapp.</p>
              </div>

              <Button
                type="button"
                variant="outline-light"
                onClick={exportCsv}
                disabled={filtered.length === 0}
              >
                <i className="fa-solid fa-file-export" />
                <span>Exportar lista</span>
              </Button>
            </div>

            <div className="cut-participants-filters">
              <div className="cut-search-bar">
                <i className="fa-solid fa-magnifying-glass" />
                <Form.Control
                  value={query}
                  onChange={(eventChange) => setQuery(eventChange.target.value)}
                  placeholder="Buscar por nome, e-mail ou ingresso"
                  aria-label="Buscar participante"
                />
              </div>

              <Form.Select
                value={statusFilter}
                onChange={(eventChange) => setStatusFilter(eventChange.target.value)}
                aria-label="Filtrar por status"
              >
                <option value="all">Todos os status</option>
                <option value="valid">Aguardando entrada</option>
                <option value="checked">Check-in realizado</option>
                <option value="invalid">Inválidos</option>
              </Form.Select>

              <Form.Select
                value={ticketFilter}
                onChange={(eventChange) => setTicketFilter(eventChange.target.value)}
                aria-label="Filtrar por ingresso"
              >
                <option value="all">Todos os ingressos</option>
                {ticketOptions.map((ticket) => (
                  <option key={ticket} value={ticket}>{ticket}</option>
                ))}
              </Form.Select>
            </div>

            <div className="cut-participants-result-summary">
              <span>
                <strong>{filtered.length}</strong> de {passes.length} registro(s) exibido(s)
              </span>
              {(query || statusFilter !== "all" || ticketFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                    setTicketFilter("all");
                  }}
                >
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="table-responsive cut-participants-table-wrap">
              <Table className="cut-table cut-participants-table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Participante</th>
                    <th>Ingresso</th>
                    <th>Emitido</th>
                    <th>Status</th>
                    <th>Check-in</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pass) => {
                    const state = passState(pass);
                    const userId = Number(pass?.user?.id || 0);

                    return (
                      <tr key={pass.id}>
                        <td>
                          <div className="cut-participant-person">
                            <span className="cut-participant-avatar" aria-hidden="true">
                              {participantInitials(pass)}
                            </span>
                            <span>
                              <strong>{participantName(pass)}</strong>
                              <small>{participantEmail(pass) || "E-mail não informado"}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <strong className="cut-participant-ticket">{pass?.ticket?.name || "Cortesia"}</strong>
                          <small className="d-block text-secondary">Ingresso #{pass.id}</small>
                        </td>
                        <td>{formatDateTime(pass?.created_at)}</td>
                        <td>
                          <Badge
                            bg={state === "checked" ? "success" : state === "invalid" ? "danger" : "secondary"}
                            className="cut-participant-status"
                          >
                            {passStateLabel(pass)}
                          </Badge>
                        </td>
                        <td>{formatDateTime(pass?.checked_in_at)}</td>
                        <td className="text-end">
                          {userId > 0 ? (
                            <Button
                              type="button"
                              variant="outline-light"
                              size="sm"
                              onClick={() => navigate(`/profile/${userId}`)}
                            >
                              Ver perfil
                            </Button>
                          ) : (
                            <span className="text-secondary small">Sem perfil</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan="6">
                        <div className="cut-participants-empty">
                          <span className="cut-participants-empty__icon">
                            <i className="fa-solid fa-users" />
                          </span>
                          <strong>
                            {passes.length === 0
                              ? "Ainda não há participantes neste evento"
                              : "Nenhum participante corresponde aos filtros"}
                          </strong>
                          <span>
                            {passes.length === 0
                              ? "Quando ingressos forem emitidos, os participantes aparecerão aqui automaticamente."
                              : "Limpe os filtros ou tente outro nome, e-mail ou ingresso."}
                          </span>
                          {passes.length === 0 && event?.is_published && (
                            <Button type="button" variant="outline-light" onClick={() => navigate(`/event/edit/${eventId}`)}>
                              Gerenciar vendas e ingressos
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      </Container>
    </div>
  );
}
