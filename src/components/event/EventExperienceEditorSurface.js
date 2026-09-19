import React, { useMemo } from "react";
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
  const primaryLabel = saveLabel || (mode === "create" ? "Criar rascunho" : "Salvar agora");

  const fieldError = (name) => {
    const value = errors?.[name];
    if (Array.isArray(value)) return value[0] || "";
    return typeof value === "string" ? value : "";
  };

  return (
    <div className="cut-event-inline-editor">
      <section className="cut-event-banner-stage cut-event-inline-editor__banner" aria-label={`Prévia da imagem de ${title}`}>
        <Container className="cut-page-container">
          <div className="cut-event-inline-editor__modebar">
            <div>
              <span className="cut-event-inline-editor__modepill"><i className={mode === "create" ? "fa-solid fa-plus" : "fa-regular fa-pen-to-square"} /> {modeLabel}</span>
              <small>Você edita diretamente na mesma estrutura que o visitante verá.</small>
            </div>
            <div className="cut-event-inline-editor__modeActions">
              {secondaryActions}
              <Button type="button" onClick={onSave} disabled={saving}><i className="fa-solid fa-check me-2" />{saving ? "Salvando..." : primaryLabel}</Button>
            </div>
          </div>

          <div className={imagePreview ? "cut-event-banner-frame cut-event-inline-editor__artwork" : "cut-event-banner-placeholder cut-event-inline-editor__artwork"}>
            <EventArtwork image={imagePreview} title={title} alt={`Prévia da imagem de ${title}`} fallbackClassName="cut-event-banner-initials" />
            <label className="cut-event-inline-editor__imageAction btn btn-light" htmlFor={`event-${mode}-image`}>
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
          <div className="cut-event-summary-card cut-event-inline-editor__summary">
            <div className="cut-event-summary-card__content">
              <div className="cut-event-inline-editor__eyebrowRow">
                <span className="cut-eyebrow">{mode === "create" ? "Novo evento" : "Evento Cutinapp"}</span>
                <span className="cut-event-inline-editor__liveBadge"><i className="fa-solid fa-eye" /> Prévia ao vivo</span>
              </div>

              {productionControl || (productionName && <span className="cut-inline-profile-link">Por {productionName}</span>)}

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
                  <span><strong>Início</strong><Form.Control type="datetime-local" name="start_date" value={form?.start_date || ""} onChange={onChange} isInvalid={Boolean(fieldError("start_date"))} /></span>
                </label>
                <label>
                  <i className="fa-regular fa-clock" aria-hidden="true" />
                  <span><strong>Término</strong><Form.Control type="datetime-local" name="end_date" value={form?.end_date || ""} onChange={onChange} isInvalid={Boolean(fieldError("end_date"))} /></span>
                </label>
                <label>
                  <i className="fa-solid fa-location-dot" aria-hidden="true" />
                  <span><strong>Local</strong><Form.Control name="venue" value={form?.venue || ""} onChange={onChange} placeholder="Nome do espaço" /></span>
                </label>
              </div>
            </div>

            <div className="cut-card-actions cut-event-summary-card__actions">
              <Button type="button" variant="outline-light" onClick={() => document.getElementById("event-editor-about")?.scrollIntoView({ behavior: "smooth", block: "start" })}><i className="fa-regular fa-pen-to-square me-2" />Descrição</Button>
              <Button type="button" variant="outline-light" onClick={() => document.getElementById("event-editor-location")?.scrollIntoView({ behavior: "smooth", block: "start" })}><i className="fa-solid fa-location-dot me-2" />Localização</Button>
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
                <Form.Group className="mt-3">
                  <Form.Label>Descrição</Form.Label>
                  <Form.Control as="textarea" rows={7} name="description" value={form?.description || ""} onChange={onChange} placeholder="Conte ao público o que torna este evento especial." isInvalid={Boolean(fieldError("description"))} />
                  {fieldError("description") && <Form.Control.Feedback type="invalid">{fieldError("description")}</Form.Control.Feedback>}
                </Form.Group>
                <div className="cut-event-details cut-event-inline-editor__details mt-4">
                  <div><i className="fa-regular fa-calendar" /><span><strong>Início</strong><Form.Control type="datetime-local" name="start_date" value={form?.start_date || ""} onChange={onChange} /></span></div>
                  <div><i className="fa-regular fa-clock" /><span><strong>Término</strong><Form.Control type="datetime-local" name="end_date" value={form?.end_date || ""} onChange={onChange} /></span></div>
                  <div><i className="fa-solid fa-location-dot" /><span><strong>Local</strong><Form.Control name="venue" value={form?.venue || ""} onChange={onChange} placeholder="Nome do espaço" /></span></div>
                  <div><i className="fa-solid fa-map" /><span><strong>Cidade</strong>{cityControl || <div className="cut-event-inline-editor__cityRow"><Form.Control name="city" value={form?.city || ""} onChange={onChange} placeholder="Cidade" /><Form.Control name="uf" maxLength={2} value={form?.uf || ""} onChange={onChange} placeholder="UF" /></div>}</span></div>
                </div>
              </Card.Body>
            </Card>

            <Card id="event-editor-location" className="cut-panel cut-event-inline-editor__viewCard">
              <Card.Body className="p-4 p-lg-5">
                <span className="cut-eyebrow">Localização</span>
                <h2 className="cut-section-title mt-2">Como chegar</h2>
                <Form.Group className="mt-3">
                  <Form.Label>Endereço</Form.Label>
                  <Form.Control name="address" value={form?.address || ""} onChange={onChange} placeholder="Rua, número e complemento" isInvalid={Boolean(fieldError("address"))} />
                  {fieldError("address") && <Form.Control.Feedback type="invalid">{fieldError("address")}</Form.Control.Feedback>}
                </Form.Group>
                <Form.Group className="mt-3">
                  <Form.Label>Link do Google Maps</Form.Label>
                  <Form.Control type="url" name="google_maps_url" value={form?.google_maps_url || ""} onChange={onChange} placeholder="https://maps.app.goo.gl/..." />
                </Form.Group>
                {mapEmbedUrl ? <iframe className="cut-event-inline-editor__map mt-3" title={`Mapa de ${title}`} src={mapEmbedUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <p className="text-secondary mt-3 mb-0">O mapa aparecerá aqui assim que o endereço for informado.</p>}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={4}>
            <Card className="cut-panel cut-event-inline-editor__sidebarCard">
              <Card.Body className="p-4">
                <span className="cut-eyebrow">Resultado visual</span>
                <h2 className="cut-section-title mt-2">Você está vendo a página enquanto cria</h2>
                <p className="text-secondary">Imagem, título, data, local e descrição aparecem na mesma ordem da página pública.</p>
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
