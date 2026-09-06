import React, { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, Col, Form, Row } from "react-bootstrap";
import { addCalendarDays, seriesDefaults, toDateInput } from "../utils/eventSeriesDates";

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

export default function EventSeriesForm({ event, busy = false, onSubmit }) {
  const tomorrow = useMemo(() => addCalendarDays(new Date(), 1), []);
  const [mode, setMode] = useState("dates");
  const [candidateDate, setCandidateDate] = useState(tomorrow);
  const [dates, setDates] = useState([]);
  const [weekdays, setWeekdays] = useState([]);
  const [rangeStart, setRangeStart] = useState(tomorrow);
  const [rangeEnd, setRangeEnd] = useState(addCalendarDays(tomorrow, 56));
  const [error, setError] = useState("");

  useEffect(() => {
    const defaults = seriesDefaults(event?.start_date, tomorrow);
    setWeekdays(defaults.weekday === null ? [] : [defaults.weekday]);
    setCandidateDate(defaults.candidateDate || tomorrow);
    setRangeStart(defaults.rangeStart || tomorrow);
    setRangeEnd(defaults.rangeEnd || addCalendarDays(tomorrow, 56));
    setDates([]);
    setError("");
  }, [event?.id, event?.start_date, tomorrow]);

  const addDate = () => {
    if (!candidateDate) return;
    const sourceDate = toDateInput(event?.start_date);
    if (candidateDate === sourceDate) {
      setError("Essa é a data da edição original. Escolha outra data.");
      return;
    }
    setDates((current) => [...new Set([...current, candidateDate])].sort());
    setError("");
  };

  const toggleWeekday = (value) => {
    setWeekdays((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
    setError("");
  };

  const submit = async () => {
    if (mode === "dates" && dates.length === 0) {
      setError("Adicione ao menos uma data.");
      return;
    }
    if (mode === "weekly" && weekdays.length === 0) {
      setError("Selecione ao menos um dia da semana.");
      return;
    }
    if (mode === "weekly" && (!rangeStart || !rangeEnd)) {
      setError("Informe o início e o fim da agenda semanal.");
      return;
    }
    if (mode === "weekly" && rangeEnd < rangeStart) {
      setError("A data final da agenda precisa ser igual ou posterior à data inicial.");
      return;
    }

    setError("");
    try {
      await onSubmit(mode === "dates"
        ? { mode: "dates", dates }
        : { mode: "weekly", weekdays, range_start: rangeStart, range_end: rangeEnd });
    } catch (err) {
      const validation = err?.errors && Object.values(err.errors).flat().find(Boolean);
      setError(validation || err?.message || "Não foi possível criar as ocorrências.");
    }
  };

  return <div>
    <Alert variant="info">
      <strong>Modelo: {event?.title || "evento selecionado"}</strong><br />
      Capa, horários, local, line-up e lotes de ingresso são reaproveitados. As novas edições ficam em rascunho e não carregam vendas, participantes, passes ou check-ins.
    </Alert>

    <div className="d-flex flex-wrap gap-2 mb-3">
      <Button type="button" variant={mode === "dates" ? "primary" : "outline-secondary"} onClick={() => setMode("dates")} disabled={busy}>
        Datas específicas
      </Button>
      <Button type="button" variant={mode === "weekly" ? "primary" : "outline-secondary"} onClick={() => setMode("weekly")} disabled={busy}>
        Agenda semanal
      </Button>
    </div>

    {mode === "dates" ? <>
      <Form.Label>Adicionar data</Form.Label>
      <div className="d-flex gap-2 align-items-start">
        <Form.Control type="date" min={tomorrow} value={candidateDate} onChange={(e) => setCandidateDate(e.target.value)} disabled={busy} />
        <Button type="button" variant="outline-primary" onClick={addDate} disabled={busy || !candidateDate}>Adicionar</Button>
      </div>
      <div className="d-flex flex-wrap gap-2 mt-3">
        {dates.map((date) => <Badge key={date} bg="secondary" className="p-2">
          {new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR")}
          <button type="button" className="btn btn-sm text-white p-0 ms-2" onClick={() => setDates((current) => current.filter((item) => item !== date))} disabled={busy} aria-label={`Remover ${date}`}>×</button>
        </Badge>)}
        {dates.length === 0 && <span className="text-secondary small">Você pode adicionar várias datas antes de criar.</span>}
      </div>
    </> : <>
      <Form.Label>Dias fixos da semana</Form.Label>
      <div className="d-flex flex-wrap gap-2 mb-3">
        {WEEKDAYS.map((day) => <Button key={day.value} type="button" size="sm" variant={weekdays.includes(day.value) ? "primary" : "outline-secondary"} onClick={() => toggleWeekday(day.value)} disabled={busy}>{day.label}</Button>)}
      </div>
      <Row className="g-3">
        <Col md={6}><Form.Group><Form.Label>De</Form.Label><Form.Control type="date" min={tomorrow} value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} disabled={busy} /></Form.Group></Col>
        <Col md={6}><Form.Group><Form.Label>Até</Form.Label><Form.Control type="date" min={rangeStart || tomorrow} value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} disabled={busy} /></Form.Group></Col>
      </Row>
      <Form.Text>Ex.: marque quinta e sábado para gerar automaticamente todas as quintas e sábados do período.</Form.Text>
    </>}

    {error && <Alert variant="danger" className="mt-3 mb-0" role="alert">{error}</Alert>}

    <Button className="mt-4 w-100" type="button" onClick={submit} disabled={busy || !event?.id}>
      {busy ? "Criando agenda..." : mode === "dates" ? `Criar ${dates.length || "várias"} edição(ões)` : "Criar agenda semanal"}
    </Button>
  </div>;
}

EventSeriesForm.propTypes = {
  event: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    start_date: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
    title: PropTypes.string,
  }),
  busy: PropTypes.bool,
  onSubmit: PropTypes.func.isRequired,
};
