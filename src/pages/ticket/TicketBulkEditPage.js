import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row, Spinner } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import ticketService from "../../services/TicketService";
import {
  buildBulkTicketUpdatePayload,
  defaultBulkTicketSelection,
  hasBulkTicketChanges,
  maxIssuedAcrossTickets,
} from "../../utils/ticketBulkEdit";
import {
  SALES_CUTOFF_PRESETS,
  buildSalesCutoffRule,
  calculateSalesCutoffForEvent,
  cutoffEditorStateFromRule,
  describeSalesCutoffRule,
  ruleFromTicket,
} from "../../utils/ticketSalesCutoff";

const money = (value) => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatDateTime = (value) => {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const fieldLabels = {
  name: "Nome",
  price: "Preço e tipo",
  quantity: "Quantidade",
  cutoff: "Encerramento das vendas",
  description: "Descrição",
};

export default function TicketBulkEditPage() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [source, setSource] = useState(null);
  const [similarTickets, setSimilarTickets] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [enabledFields, setEnabledFields] = useState({
    name: true,
    price: true,
    quantity: true,
    cutoff: true,
    description: true,
  });
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [ticketType, setTicketType] = useState("standard");
  const [description, setDescription] = useState("");
  const [cutoffPreset, setCutoffPreset] = useState("at_start");
  const [customCutoffMode, setCustomCutoffMode] = useState("after_start");
  const [customCutoffAmount, setCustomCutoffAmount] = useState(2);
  const [customCutoffUnit, setCustomCutoffUnit] = useState("hours");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await ticketService.similar(ticketId);
      const sourceTicket = response?.source_ticket || null;
      const candidates = Array.isArray(response?.similar_tickets) ? response.similar_tickets : [];
      if (!sourceTicket?.id) throw new Error("Ingresso de referência não encontrado.");

      setSource(sourceTicket);
      setSimilarTickets(candidates);
      setSelectedIds(defaultBulkTicketSelection(sourceTicket, candidates));
      setName(sourceTicket.name || "");
      setPrice(String(sourceTicket.price ?? "0"));
      setQuantity(Number(sourceTicket.quantity || 1));
      setTicketType(sourceTicket.ticket_type || (Number(sourceTicket.price || 0) > 0 ? "standard" : "courtesy"));
      setDescription(sourceTicket.description || "");

      const rule = ruleFromTicket(sourceTicket);
      const editor = cutoffEditorStateFromRule(rule);
      setCutoffPreset(editor.preset);
      setCustomCutoffMode(editor.customMode);
      setCustomCutoffAmount(editor.customAmount);
      setCustomCutoffUnit(editor.customUnit);
    } catch (err) {
      setError(err?.message || "Não foi possível localizar ingressos semelhantes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [ticketId]);

  const allTickets = useMemo(() => source ? [source, ...similarTickets] : similarTickets, [source, similarTickets]);
  const selectedTickets = useMemo(
    () => allTickets.filter((ticket) => selectedIds.includes(Number(ticket.id))),
    [allTickets, selectedIds],
  );
  const maxIssued = useMemo(() => maxIssuedAcrossTickets(selectedTickets), [selectedTickets]);
  const cutoffRule = useMemo(() => buildSalesCutoffRule({
    preset: cutoffPreset,
    customMode: customCutoffMode,
    customAmount: customCutoffAmount,
    customUnit: customCutoffUnit,
  }), [cutoffPreset, customCutoffMode, customCutoffAmount, customCutoffUnit]);
  const cutoffPreviews = useMemo(() => {
    if (!enabledFields.cutoff) return [];
    const now = new Date();
    return selectedTickets.map((ticket) => ({
      ticket,
      ...calculateSalesCutoffForEvent(ticket.event, cutoffRule, now),
    }));
  }, [selectedTickets, cutoffRule, enabledFields.cutoff]);

  const priceInvalid = enabledFields.price && (!Number.isFinite(Number(price)) || Number(price) < 0 || Number(price) > 999999.99);
  const quantityInvalid = enabledFields.quantity && (!Number.isInteger(Number(quantity)) || Number(quantity) < Math.max(1, maxIssued) || Number(quantity) > 100000);
  const nameInvalid = enabledFields.name && !name.trim();
  const descriptionInvalid = enabledFields.description && description.length > 5000;
  const customCutoffInvalid = enabledFields.cutoff && cutoffPreset === "custom"
    && (!Number.isFinite(Number(customCutoffAmount)) || Number(customCutoffAmount) < 1);
  const cutoffInvalid = enabledFields.cutoff && (customCutoffInvalid || cutoffPreviews.some((preview) => !preview.valid));
  const canSave = selectedIds.length >= 2
    && hasBulkTicketChanges(enabledFields)
    && !priceInvalid
    && !quantityInvalid
    && !nameInvalid
    && !descriptionInvalid
    && !cutoffInvalid
    && !saving;

  const toggleTicket = (id) => {
    const numericId = Number(id);
    if (numericId === Number(source?.id)) return;
    setSelectedIds((current) => current.includes(numericId)
      ? current.filter((value) => value !== numericId)
      : [...current, numericId]);
  };

  const selectAll = () => setSelectedIds(allTickets.map((ticket) => Number(ticket.id)));
  const selectHighConfidence = () => setSelectedIds(defaultBulkTicketSelection(source, similarTickets));
  const toggleField = (field) => setEnabledFields((current) => ({ ...current, [field]: !current[field] }));

  const save = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!canSave) {
      if (selectedIds.length < 2) setError("Selecione pelo menos dois ingressos de eventos diferentes.");
      else if (!hasBulkTicketChanges(enabledFields)) setError("Selecione pelo menos um campo para alterar.");
      else if (quantityInvalid) setError(`A quantidade precisa ser de pelo menos ${Math.max(1, maxIssued)}, pois há ingressos já emitidos em um dos eventos selecionados.`);
      else if (cutoffInvalid) setError("Revise o encerramento das vendas. O prazo precisa continuar válido para todos os eventos selecionados.");
      else setError("Revise os campos antes de aplicar as alterações.");
      return;
    }

    const payload = buildBulkTicketUpdatePayload({
      selectedIds,
      enabledFields,
      values: { name, price, quantity, ticket_type: ticketType, description },
      cutoffRule,
    });

    if (!window.confirm(`Aplicar estas alterações em ${selectedIds.length} ingressos de ${selectedTickets.length} evento(s)?`)) return;

    setSaving(true);
    try {
      const response = await ticketService.bulkUpdate(payload);
      setSuccess(response?.message || `${selectedIds.length} ingressos atualizados.`);
      try {
        window.PeterTecnetTelemetry?.track?.("producer_ticket_bulk_updated", {
          label: source?.name || "Ingresso",
          target: selectedIds.join(","),
          metadata: {
            source_ticket_id: Number(source?.id || 0),
            ticket_count: selectedIds.length,
            fields: Object.keys(enabledFields).filter((field) => enabledFields[field]),
          },
        });
      } catch (_) {
        // Telemetry must never interrupt producer workflow.
      }
      await load();
    } catch (err) {
      setError(err?.message || "Não foi possível atualizar os ingressos selecionados.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {(loading || saving) && <ProcessingIndicatorComponent label={saving ? "Atualizando ingressos" : "Procurando ingressos semelhantes"} />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Edição em massa</span>
            <h1>Editar ingressos semelhantes</h1>
            <p>Altere de uma vez o mesmo lote em vários eventos. Cada ingresso continua com ID, estoque, vendas, reservas e QR Codes independentes.</p>
          </div>
          <div className="cut-card-actions">
            <Button variant="outline-light" onClick={() => navigate(source?.event_id ? `/event/${source.event_id}/courtesies` : "/event/manage")}>Voltar</Button>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {!loading && source && (
          <Form onSubmit={save}>
            <Card className="cut-panel mb-4">
              <Card.Body className="p-4">
                <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                  <div>
                    <span className="cut-eyebrow">Ingresso de referência</span>
                    <h2 className="cut-section-title mt-2">{source.name} · {money(source.price)}</h2>
                    <p className="text-secondary mb-0">{source.event?.title || "Evento"} · {formatDateTime(source.event?.start_date)}</p>
                  </div>
                  <Badge bg="primary">sempre selecionado</Badge>
                </div>
                <div className="cut-info-box">
                  <strong>Como a Cutinapp encontrou os semelhantes</strong>
                  <span>Comparamos nome do lote, tipo, preço, quantidade e regra de encerramento. Você escolhe exatamente quais ingressos serão alterados antes de salvar.</span>
                </div>
              </Card.Body>
            </Card>

            <Card className="cut-panel mb-4">
              <Card.Body className="p-4">
                <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
                  <div>
                    <span className="cut-eyebrow">Eventos</span>
                    <h2 className="cut-section-title mt-2 mb-0">Ingressos semelhantes encontrados</h2>
                  </div>
                  <div className="d-flex gap-2 flex-wrap">
                    <Button type="button" size="sm" variant="outline-light" onClick={selectHighConfidence}>Só alta semelhança</Button>
                    <Button type="button" size="sm" variant="outline-light" onClick={selectAll}>Selecionar todos</Button>
                  </div>
                </div>

                <div className="border rounded p-2" style={{ maxHeight: 360, overflowY: "auto" }}>
                  {allTickets.map((ticket) => {
                    const isSource = Number(ticket.id) === Number(source.id);
                    const checked = selectedIds.includes(Number(ticket.id));
                    return (
                      <label key={ticket.id} className="d-flex align-items-start gap-3 p-3 rounded" style={{ cursor: isSource ? "default" : "pointer" }}>
                        <Form.Check
                          checked={checked}
                          disabled={isSource}
                          onChange={() => toggleTicket(ticket.id)}
                          aria-label={`Selecionar ingresso de ${ticket.event?.title || "evento"}`}
                        />
                        <span className="flex-grow-1">
                          <strong className="d-block">{ticket.event?.title || `Evento #${ticket.event_id}`}</strong>
                          <small className="text-body-secondary d-block">
                            {ticket.name} · {money(ticket.price)} · {ticket.quantity} un. · {Number(ticket.passes_count || 0)} emitido(s)
                          </small>
                          <small className="text-body-secondary">{formatDateTime(ticket.event?.start_date)}</small>
                        </span>
                        {isSource ? <Badge bg="primary">referência</Badge> : <Badge bg={Number(ticket.similarity_score || 0) >= 90 ? "success" : "secondary"}>{Number(ticket.similarity_score || 0)}% semelhante</Badge>}
                      </label>
                    );
                  })}
                </div>
                {similarTickets.length === 0 && (
                  <Alert variant="secondary" className="mt-3 mb-0">Nenhum outro ingresso semelhante foi encontrado nos seus eventos futuros.</Alert>
                )}
                <Form.Text>{selectedIds.length} ingresso(s) selecionado(s) em {selectedTickets.length} evento(s).</Form.Text>
              </Card.Body>
            </Card>

            <Card className="cut-panel mb-4">
              <Card.Body className="p-4">
                <span className="cut-eyebrow">Alterações</span>
                <h2 className="cut-section-title mt-2">Escolha o que será igualado</h2>
                <p className="text-secondary">Desmarque qualquer campo que deve continuar diferente em cada evento.</p>

                <Row className="g-4">
                  {Object.keys(fieldLabels).map((field) => (
                    <Col xs={12} key={field}>
                      <div className="d-flex align-items-center justify-content-between gap-3 mb-2">
                        <Form.Label className="mb-0">{fieldLabels[field]}</Form.Label>
                        <Form.Check
                          type="switch"
                          id={`bulk-field-${field}`}
                          label={enabledFields[field] ? "Alterar" : "Manter atual"}
                          checked={enabledFields[field]}
                          onChange={() => toggleField(field)}
                        />
                      </div>

                      {field === "name" && enabledFields.name && (
                        <Form.Control value={name} onChange={(e) => setName(e.target.value)} isInvalid={nameInvalid} />
                      )}

                      {field === "price" && enabledFields.price && (
                        <Row className="g-2">
                          <Col md={5}>
                            <Form.Control type="number" min="0" max="999999.99" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} isInvalid={priceInvalid} />
                          </Col>
                          <Col md={7}>
                            <Form.Select value={ticketType} onChange={(e) => setTicketType(e.target.value)}>
                              <option value="standard">Padrão</option>
                              <option value="vip">VIP</option>
                              <option value="premium">Premium</option>
                              <option value="student">Estudante</option>
                              <option value="half">Meia</option>
                              <option value="full">Inteira</option>
                              <option value="courtesy">Cortesia</option>
                            </Form.Select>
                          </Col>
                        </Row>
                      )}

                      {field === "quantity" && enabledFields.quantity && (
                        <>
                          <Form.Control
                            type="number"
                            min={Math.max(1, maxIssued)}
                            max={100000}
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            isInvalid={quantityInvalid}
                          />
                          <Form.Text>A menor quantidade permitida para esta seleção é {Math.max(1, maxIssued)}, considerando ingressos já emitidos.</Form.Text>
                        </>
                      )}

                      {field === "description" && enabledFields.description && (
                        <>
                          <Form.Control as="textarea" rows={3} maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} isInvalid={descriptionInvalid} />
                          <Form.Text>{description.length}/5000</Form.Text>
                        </>
                      )}

                      {field === "cutoff" && enabledFields.cutoff && (
                        <div>
                          <Form.Select value={cutoffPreset} onChange={(e) => setCutoffPreset(e.target.value)} isInvalid={cutoffInvalid}>
                            {SALES_CUTOFF_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
                          </Form.Select>
                          {cutoffPreset === "custom" && (
                            <Row className="g-2 mt-1">
                              <Col md={4}>
                                <Form.Control type="number" min={1} value={customCutoffAmount} onChange={(e) => setCustomCutoffAmount(e.target.value)} />
                              </Col>
                              <Col md={3}>
                                <Form.Select value={customCutoffUnit} onChange={(e) => setCustomCutoffUnit(e.target.value)}>
                                  <option value="minutes">minutos</option>
                                  <option value="hours">horas</option>
                                  <option value="days">dias</option>
                                </Form.Select>
                              </Col>
                              <Col md={5}>
                                <Form.Select value={customCutoffMode} onChange={(e) => setCustomCutoffMode(e.target.value)}>
                                  <option value="before_start">antes do início</option>
                                  <option value="after_start">depois do início</option>
                                  <option value="before_end">antes do término</option>
                                </Form.Select>
                              </Col>
                            </Row>
                          )}
                          <Form.Text>Regra: {describeSalesCutoffRule(cutoffRule)}. Ela será recalculada separadamente em cada evento.</Form.Text>

                          <div className={`cut-info-box mt-3 ${cutoffInvalid ? "border border-danger" : ""}`}>
                            <strong>Prévia do encerramento</strong>
                            {cutoffPreviews.slice(0, 5).map((preview) => (
                              <span key={preview.ticket.id} className={preview.valid ? "" : "text-danger"}>
                                {preview.ticket.event?.title || `Evento #${preview.ticket.event_id}`}: {preview.date ? formatDateTime(preview.date) : preview.reason}
                                {preview.clamped ? " · limitado ao término do evento" : ""}
                                {!preview.valid && preview.date ? ` · ${preview.reason}` : ""}
                              </span>
                            ))}
                            {cutoffPreviews.length > 5 && <span>+ {cutoffPreviews.length - 5} evento(s) com a mesma regra.</span>}
                          </div>
                        </div>
                      )}
                    </Col>
                  ))}
                </Row>
              </Card.Body>
            </Card>

            <Card className="cut-panel">
              <Card.Body className="p-4">
                <div className="cut-info-box mb-4">
                  <strong>{selectedIds.length} ingresso(s) serão atualizados</strong>
                  <span>Somente os campos marcados como “Alterar” serão modificados. Todo o histórico de vendas e emissões permanece preservado.</span>
                </div>
                <div className="cut-form-actions">
                  <Button type="button" variant="outline-light" onClick={() => navigate(source?.event_id ? `/event/${source.event_id}/courtesies` : "/event/manage")}>Cancelar</Button>
                  <Button type="submit" disabled={!canSave}>{saving ? "Atualizando..." : `Aplicar em ${selectedIds.length} ingresso(s)`}</Button>
                </div>
              </Card.Body>
            </Card>
          </Form>
        )}

        {!loading && !source && !error && (
          <Card className="cut-empty-state"><Card.Body><Spinner size="sm" className="me-2" />Ingresso não encontrado.</Card.Body></Card>
        )}
      </Container>
    </div>
  );
}
