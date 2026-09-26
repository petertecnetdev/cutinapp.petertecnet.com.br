import React, { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import EventArtwork from "./EventArtwork";
import { FormattedTextEditor } from "../editor/FormattedText";
import "./EventExperienceEditorSurface.css";

const buildMapEmbedUrl = (form) => {
  const query = [form?.venue, form?.address, form?.city, form?.uf].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : "";
};

const validDate = (value) => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date;
};

export default function EventExperienceEditorSurface({
  mode = "edit",
  form,
  imagePreview = "",
  onChange,
  onImageChange,
  onSave,
  saving = false,
  saveLabel,
  productionName = "",
  productionControl = null,
  cityControl = null,
  errors = {},
  imageHelp = "",
  secondaryActions = null,
  children = null,
}) {
  const [validationRequested, setValidationRequested] = useState(false);
  const mapEmbedUrl = useMemo(() => buildMapEmbedUrl(form), [form]);
  const title = form?.title?.trim() || "Nome do evento";
  const modeLabel = mode === "create" ? "Criando evento" : "Editando evento";
  const primaryLabel = saveLabel || (mode === "create" ? "Criar e publicar" : "Salvar agora");

  const fieldError = (name) => {
    const value = errors?.[name];
    if (Array.isArray(value)) return value[0] || "";
    return typeof value === "string" ? value : "";
  };

  const startDate = validDate(form?.start_date);
  const endDate = validDate(form?.end_date);
  const startOk = Boolean(startDate)
    && (mode !== "create" || startDate.getTime() >= Date.now() + 5 * 60 * 1000)
    && !fieldError("start_date");
  const endOk = Boolean(endDate)
    && Boolean(startDate)
    && endDate.getTime() > startDate.getTime()
    && !fieldError("end_date");
  const capacityValue = String(form?.max_attendees ?? "").trim();
  const readinessRows = [
    { key: "production_id", label: "Produção responsável", issueLabel: "Produção responsável", ok: Boolean(form?.production_id) && !fieldError("production_id") },
    { key: "title", label: "Nome", issueLabel: "Nome do evento (mínimo 2 caracteres)", ok: String(form?.title || "").trim().length >= 2 && !fieldError("title") },
    { key: "description", label: "Descrição", issueLabel: "Descrição", ok: Boolean(String(form?.description || "").trim()) && !fieldError("description") },
    { key: "address", label: "Endereço", issueLabel: "Endereço do evento", ok: Boolean(String(form?.address || "").trim()) && !fieldError("address") },
    { key: "city", label: "Cidade", issueLabel: "Cidade", ok: Boolean(String(form?.city || "").trim()) && !fieldError("city") },
    { key: "uf", label: "UF", issueLabel: "UF (2 letras)", ok: String(form?.uf || "").trim().length === 2 && !fieldError("uf") },
    { key: "start_date", label: "Início", issueLabel: "Início (horário futuro)", ok: startOk },
    { key: "end_date", label: "Término", issueLabel: "Término (depois do início)", ok: endOk },
  ];

  if (capacityValue !== "") {
    readinessRows.push({
      key: "max_attendees",
      label: "Capacidade",
      issueLabel: "Capacidade (mínimo 1)",
      ok: Number.isFinite(Number(capacityValue)) && Number(capacityValue) >= 1 && !fieldError("max_attendees"),
    });
  }

  const incompleteRows = readinessRows.filter((row) => !row.ok);
  const handleSave = () => {
    if (mode === "create" && incompleteRows.length > 0) {
      setValidationRequested(true);
      window.setTimeout(() => {
        document.getElementById("event-editor-validation")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 0);
      return;
    }
    onSave();
  };

  const validationSummary = validationRequested && mode === "create" && incompleteRows.length > 0 ? (
    <div id="event-editor-validation" className="cut-form-message cut-form-message--error mt-3" role="alert" aria-live="assertive">
      <strong>Falta revisar {incompleteRows.length === 1 ? "1 campo" : `${incompleteRows.length} campos`}:</strong>
      <ul className="mb-0 mt-2 ps-3">
        {incompleteRows.map((row) => <li key={row.key}>{row.issueLabel}</li>)}
      </ul>
    </div>
  ) : null;

  return (
    <div className="cut-event-inline-editor cut-event-view-page">
      <section className="cut-event-banner-stage cut-event-inline-editor__banner" aria-label={`Prévia da imagem de ${title}`}>
        <Container className="cut-page-container">
          <div className="cut-event-inline-editor__modebar">
            <div>
              <span className="cut-event-inline-editor__modepill">
                <i className={mode === "create" ? "fa-solid fa-plus" : "fa-regular fa-pen-to-square"} /> {modeLabel}
              </span>
              <small>Edite a prévia pública do evento e salve quando terminar.</small>
            </div>
            <div className="cut-event-inline-editor__modeActions">
              <Button type="button" className="cut-event-inline-editor__primaryAction" onClick={handleSave} disabled={saving}>
                <i className="fa-solid fa-check me-2" />{saving ? "Salvando..." : primaryLabel}
              </Button>
            </div>
          </div>
          {validationSummary}

          <div className={imagePreview ? "cut-event-banner-frame cut-event-inline-editor__artwork" : "cut-event-banner-placeholder cut-event-inline-editor__artwork"}>
            <EventArtwork image={imagePreview} title={title} alt={`Prévia da imagem de ${title}`} fallbackClassName="cut-event-banner-initials" />
            <label className="cut-event-inline-editor__imageAction btn" htmlFor={`event-${mode}-image`}>
              <i className="fa-regular fa-image me-2" />{imagePreview ? "Trocar imagem" : "Adicionar imagem"}
            </label>
            <Form.Control
              id={`event-${mode}-image`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              data-event-image-input="true"
              data-image-kind="event-poster"
              data-pt-image-enhancer="off"
              data-media-library="off"
              onChange={onImageChange}
              hidden
            />
          </div>
          {imageHelp && <small className="cut-event-inline-editor__imageHelp">{imageHelp}</small>}
        </Container>
      </section>

      <section className="cut-event-summary-strip">
        <Container className="cut-page-container">
          <div className="cut-event-summary-card">
            <div className="cut-event-summary-card__content">
              <div className="d-flex flex-wrap gap-2 mb-3">
                <span className="badge text-bg-dark">{mode === "create" ? "Novo evento" : "Evento Cutinapp"}</span>
                <span className="badge text-bg-info text-dark"><i className="fa-solid fa-eye me-1" />Prévia ao vivo</span>
              </div>

              <Form.Control
                name="title"
                value={form?.title || ""}
                onChange={onChange}
                placeholder="Nome do evento"
                className="cut-event-inline-editor__title"
                isInvalid={Boolean(fieldError("title"))}
                aria-label="Nome do evento"
              />
              {fieldError("title") && <div className="invalid-feedback d-block">{fieldError("title")}</div>}

              <div className="cut-event-summary-card__meta cut-event-inline-editor__summaryMeta">
                <label>
                  <i className="fa-regular fa-calendar" aria-hidden="true" />
                  <span>
                    <strong>Data e horário</strong>
                    <div className="cut-event-inline-editor__datePair">
                      <Form.Control type="datetime-local" name="start_date" value={form?.start_date || ""} onChange={onChange} isInvalid={Boolean(fieldError("start_date"))} aria-label="Início do evento" />
                      <Form.Control type="datetime-local" name="end_date" value={form?.end_date || ""} onChange={onChange} isInvalid={Boolean(fieldError("end_date"))} aria-label="Término do evento" />
                    </div>
                  </span>
                </label>
                <label>
                  <i className="fa-solid fa-location-dot" aria-hidden="true" />
                  <span>
                    <strong>Local</strong>
                    <Form.Control name="venue" value={form?.venue || ""} onChange={onChange} placeholder="Nome do espaço" aria-label="Local do evento" />
                  </span>
                </label>
              </div>

              {productionName && <span className="cut-inline-profile-link mt-3">Por {productionName}</span>}
            </div>

            <div className="cut-card-actions cut-event-summary-card__actions">
              <Button type="button" variant="outline-light" className="cut-event-inline-editor__summaryAction" onClick={() => document.getElementById("event-editor-about")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <i className="fa-regular fa-pen-to-square me-2" />Sobre o evento
              </Button>
              <Button type="button" variant="outline-light" className="cut-event-inline-editor__summaryAction" onClick={() => document.getElementById("event-editor-location")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <i className="fa-solid fa-location-dot me-2" />Localização
              </Button>
              <Button type="button" className="cut-event-inline-editor__primaryAction cut-event-inline-editor__summaryAction" onClick={handleSave} disabled={saving}>
                <i className="fa-solid fa-floppy-disk me-2" />{saving ? "Salvando..." : primaryLabel}
              </Button>
            </div>
          </div>
        </Container>
      </section>

      <Container className="cut-page-container py-4 py-lg-5">
        <Row className="g-4">
          <Col lg={8}>
            <Card id="event-editor-about" className="cut-panel mb-4 cut-event-inline-editor__viewCard">
              <Card.Body className="p-4 p-lg-5">
                <span className="cut-eyebrow">Sobre o evento</span>
                <h2 className="cut-section-title mt-2">Informações</h2>

                <Form.Group className="mb-4 cut-event-inline-editor__publicField">
                  <Form.Label>Descrição exibida ao público</Form.Label>
                  <FormattedTextEditor
                    value={form?.description || ""}
                    onChange={(description) => onChange({ target: { name: "description", value: description } })}
                    placeholder="Conte ao público o que torna este evento especial."
                    rows={9}
                    maxLength={10000}
                    ariaLabel="Descrição formatada do evento"
                  />
                  {fieldError("description") && <div className="invalid-feedback d-block">{fieldError("description")}</div>}
                </Form.Group>

                <div className="cut-event-details">
                  <div>
                    <i className="fa-regular fa-calendar" />
                    <span><strong>Início</strong><Form.Control type="datetime-local" name="start_date" value={form?.start_date || ""} onChange={onChange} /></span>
                  </div>
                  <div>
                    <i className="fa-regular fa-clock" />
                    <span><strong>Término</strong><Form.Control type="datetime-local" name="end_date" value={form?.end_date || ""} onChange={onChange} /></span>
                  </div>
                  <div>
                    <i className="fa-solid fa-location-dot" />
                    <span><strong>Local</strong><Form.Control name="venue" value={form?.venue || ""} onChange={onChange} placeholder="Nome do espaço" /></span>
                  </div>
                  <div>
                    <i className="fa-solid fa-map" />
                    <span>
                      <strong>Cidade</strong>
                      {cityControl || <div className="cut-event-inline-editor__cityRow"><Form.Control name="city" value={form?.city || ""} onChange={onChange} placeholder="Cidade" /><Form.Control name="uf" maxLength={2} value={form?.uf || ""} onChange={onChange} placeholder="UF" /></div>}
                    </span>
                  </div>
                </div>
              </Card.Body>
            </Card>

            {(productionControl || productionName) && (
              <Card className="cut-panel mb-4 cut-event-inline-editor__viewCard">
                <Card.Body className="p-4">
                  <span className="cut-eyebrow">Responsável</span>
                  <div className="cut-production-inline cut-event-inline-editor__productionCard">
                    <div>
                      <h2>{productionName || "Escolha a produção"}</h2>
                      <p>Esta é a produção que aparecerá como responsável na página pública do evento.</p>
                    </div>
                    <div className="cut-event-inline-editor__productionControl">{productionControl || <span className="cut-inline-profile-link">Por {productionName}</span>}</div>
                  </div>
                </Card.Body>
              </Card>
            )}

            <Card id="event-editor-location" className="cut-panel cut-event-inline-editor__mapShell">
              <Card.Body className="p-4">
                <div className="cut-event-inline-editor__mapEditor">
                  <Form.Group>
                    <Form.Label>Endereço usado na página</Form.Label>
                    <Form.Control name="address" value={form?.address || ""} onChange={onChange} placeholder="Rua, número e complemento" isInvalid={Boolean(fieldError("address"))} />
                    {fieldError("address") && <Form.Control.Feedback type="invalid">{fieldError("address")}</Form.Control.Feedback>}
                  </Form.Group>
                  <Form.Group>
                    <Form.Label>Link do Google Maps</Form.Label>
                    <Form.Control type="url" name="google_maps_url" value={form?.google_maps_url || ""} onChange={onChange} placeholder="https://maps.app.goo.gl/..." />
                  </Form.Group>
                </div>
              </Card.Body>
              {mapEmbedUrl ? (
                <iframe className="cut-event-inline-editor__map" title={`Mapa de ${title}`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              ) : (
                <div className="cut-event-inline-editor__mapEmpty">
                  <i className="fa-solid fa-map-location-dot" />
                  <strong>O mapa aparecerá aqui</strong>
                  <span>Informe endereço, cidade ou local para visualizar exatamente como ficará para o visitante.</span>
                </div>
              )}
            </Card>
          </Col>

          <Col lg={4}>
            <Card className="cut-panel cut-event-inline-editor__sidebarCard">
              <Card.Body className="p-4">
                <span className="cut-eyebrow">Gestão</span>
                <h2 className="cut-section-title mt-2">Ferramentas do evento</h2>
                <p className="text-secondary">A coluna ocupa o mesmo lugar das ferramentas do produtor na página pública.</p>

                <div className="cut-owner-actions mt-4">
                  <Button type="button" className="cut-event-inline-editor__primaryAction" onClick={handleSave} disabled={saving}><i className="fa-solid fa-floppy-disk me-2" />{saving ? "Salvando..." : primaryLabel}</Button>
                  {secondaryActions}
                  <Button type="button" variant="outline-light" onClick={() => document.getElementById("event-editor-about")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Editar informações</Button>
                  <Button type="button" variant="outline-light" onClick={() => document.getElementById("event-editor-location")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Editar localização</Button>
                </div>

                {mode === "create" && incompleteRows.length > 0 && (
                  <div className="cut-form-message cut-form-message--error mt-4" aria-live="polite">
                    <strong>Antes de publicar, revise:</strong>
                    <div className="mt-1">{incompleteRows.map((row) => row.issueLabel).join(" · ")}</div>
                  </div>
                )}
                {mode === "create" && incompleteRows.length === 0 && (
                  <div className="cut-form-message cut-form-message--success mt-4"><strong>Campos obrigatórios completos.</strong></div>
                )}

                <div className="cut-event-inline-editor__readiness">
                  {readinessRows.map((row) => (
                    <span key={row.key} className={row.ok ? "is-ok" : ""}>
                      <i className="fa-solid fa-circle-check" /> {row.label}
                    </span>
                  ))}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {children}
      </Container>
    </div>
  );
}

EventExperienceEditorSurface.propTypes = {
  mode: PropTypes.oneOf(["create", "edit"]),
  form: PropTypes.shape({
    production_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    title: PropTypes.string,
    description: PropTypes.string,
    venue: PropTypes.string,
    address: PropTypes.string,
    google_maps_url: PropTypes.string,
    city: PropTypes.string,
    uf: PropTypes.string,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
    max_attendees: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  }).isRequired,
  imagePreview: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onImageChange: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  saving: PropTypes.bool,
  saveLabel: PropTypes.string,
  productionName: PropTypes.string,
  productionControl: PropTypes.node,
  cityControl: PropTypes.node,
  errors: PropTypes.objectOf(PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)])),
  imageHelp: PropTypes.string,
  secondaryActions: PropTypes.node,
  children: PropTypes.node,
};
