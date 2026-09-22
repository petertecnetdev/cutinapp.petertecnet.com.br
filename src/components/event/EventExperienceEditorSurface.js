import React, { useMemo } from "react";
import PropTypes from "prop-types";
import { Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import EventArtwork from "./EventArtwork";
import "./EventExperienceEditorSurface.css";

const buildMapEmbedUrl = (form) => {
  const query = [form?.venue, form?.address, form?.city, form?.uf].filter(Boolean).join(", ");
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : "";
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
  const mapEmbedUrl = useMemo(() => buildMapEmbedUrl(form), [form]);
  const title = form?.title?.trim() || "Nome do evento";
  const modeLabel = mode === "create" ? "Criando evento" : "Editando evento";
  const primaryLabel = saveLabel || (mode === "create" ? "Criar e publicar" : "Salvar agora");

  const fieldError = (name) => {
    const value = errors?.[name];
    if (Array.isArray(value)) return value[0] || "";
    return typeof value === "string" ? value : "";
  };

  return (
    <div className="cut-event-inline-editor cut-event-view-page">
      <section className="cut-event-banner-stage cut-event-inline-editor__banner" aria-label={`Prévia da imagem de ${title}`}>
        <Container className="cut-page-container">
          <div className="cut-event-inline-editor__modebar">
            <div>
              <span className="cut-event-inline-editor__modepill">
                <i className={mode === "create" ? "fa-solid fa-plus" : "fa-regular fa-pen-to-square"} /> {modeLabel}
              </span>
              <small>Edite cada informação exatamente no ponto em que ela aparece para o visitante.</small>
            </div>
            <div className="cut-event-inline-editor__modeActions">
              <Button type="button" className="cut-event-inline-editor__primaryAction" onClick={onSave} disabled={saving}>
                <i className="fa-solid fa-check me-2" />{saving ? "Salvando..." : primaryLabel}
              </Button>
            </div>
          </div>

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
              <Button type="button" variant="outline-light" onClick={() => document.getElementById("event-editor-about")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <i className="fa-regular fa-pen-to-square me-2" />Sobre o evento
              </Button>
              <Button type="button" variant="outline-light" onClick={() => document.getElementById("event-editor-location")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                <i className="fa-solid fa-location-dot me-2" />Localização
              </Button>
              <Button type="button" className="cut-event-inline-editor__primaryAction" onClick={onSave} disabled={saving}>
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
                  <Form.Control
                    as="textarea"
                    rows={7}
                    name="description"
                    value={form?.description || ""}
                    onChange={onChange}
                    placeholder="Conte ao público o que torna este evento especial."
                    isInvalid={Boolean(fieldError("description"))}
                  />
                  {fieldError("description") && <Form.Control.Feedback type="invalid">{fieldError("description")}</Form.Control.Feedback>}
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
                  <Button type="button" className="cut-event-inline-editor__primaryAction" onClick={onSave} disabled={saving}><i className="fa-solid fa-floppy-disk me-2" />{saving ? "Salvando..." : primaryLabel}</Button>
                  {secondaryActions}
                  <Button type="button" variant="outline-light" onClick={() => document.getElementById("event-editor-about")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Editar informações</Button>
                  <Button type="button" variant="outline-light" onClick={() => document.getElementById("event-editor-location")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Editar localização</Button>
                </div>

                <div className="cut-event-inline-editor__readiness">
                  <span className={form?.title?.trim() ? "is-ok" : ""}><i className="fa-solid fa-circle-check" /> Nome</span>
                  <span className={imagePreview ? "is-ok" : ""}><i className="fa-solid fa-circle-check" /> Imagem</span>
                  <span className={form?.description?.trim() ? "is-ok" : ""}><i className="fa-solid fa-circle-check" /> Descrição</span>
                  <span className={form?.start_date && form?.end_date ? "is-ok" : ""}><i className="fa-solid fa-circle-check" /> Data</span>
                  <span className={form?.address?.trim() ? "is-ok" : ""}><i className="fa-solid fa-circle-check" /> Local</span>
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
    title: PropTypes.string,
    description: PropTypes.string,
    venue: PropTypes.string,
    address: PropTypes.string,
    google_maps_url: PropTypes.string,
    city: PropTypes.string,
    uf: PropTypes.string,
    start_date: PropTypes.string,
    end_date: PropTypes.string,
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
