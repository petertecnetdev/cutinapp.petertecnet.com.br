import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EventArtwork from "../../components/event/EventArtwork";
import { FormattedText, FormattedTextEditor } from "../../components/editor/FormattedText";
import LocationFields from "../../components/location/LocationFields";
import ProductionGallery from "../../components/production/ProductionGallery";
import ProductionGalleryManager from "../../components/production/ProductionGalleryManager";
import useAutoSave from "../../hooks/useAutoSave";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import "./production-experience.css";
import "./production-inline-editor.css";

const media = (path) => !path ? "" : /^https?:\/\//i.test(path) ? path : `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
const firstError = (errors, field) => Array.isArray(errors?.[field]) ? errors[field][0] || "" : typeof errors?.[field] === "string" ? errors[field] : "";
const experienceKeys = ["type","city_id","city","uf","cep","address","address_number","neighborhood","address_complement","address_reference","formatted_address","latitude","longitude","place_id","google_maps_url","location_public"];

const productionIsValid = (value) => {
  if (!value?.name || value.name.trim().length < 2) return false;
  const cnpjDigits = String(value.cnpj || "").replace(/\D/g, "");
  return cnpjDigits === "" || cnpjDigits.length === 14;
};

const autosaveLabel = (status) => {
  if (status === "saving") return "Salvando...";
  if (status === "saved") return "Salvo automaticamente";
  if (status === "dirty") return "Alterações pendentes";
  if (status === "error") return "Falha ao salvar";
  return "Salvamento automático ativo";
};

const initials = (name) => String(name || "P")
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join("")
  .toUpperCase();

const fmt = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(value))
  : "Data a definir";

export default function ProductionUpdatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [productionMeta, setProductionMeta] = useState(null);
  const [events, setEvents] = useState([]);
  const [analytics, setAnalytics] = useState({ total_views: 0, unique_viewers: 0, viewers: [] });
  const [logo, setLogo] = useState(null);
  const [background, setBackground] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bgPreview, setBgPreview] = useState("");
  const [galleryMedia, setGalleryMedia] = useState([]);
  const [galleryAlbums, setGalleryAlbums] = useState([]);
  const [editAbout, setEditAbout] = useState(false);
  const [editLocation, setEditLocation] = useState(false);
  const [editDetails, setEditDetails] = useState(false);
  const [galleryManagerOpen, setGalleryManagerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    cutinappService.productionWorkspace(id).then((workspace) => {
      const production = workspace?.organization || workspace?.production;
      if (!active || !production) return;

      setProductionMeta(production);
      setForm({
        name: production.name || "",
        fantasy: production.fantasy || "",
        type: production.type || "independent",
        cnpj: production.cnpj || "",
        phone: production.phone || "",
        description: production.description || "",
        city_id: production.city_id || "",
        city: production.city || "",
        uf: production.uf || "",
        cep: production.cep || "",
        address: production.address || "",
        address_number: production.address_number || "",
        neighborhood: production.neighborhood || "",
        address_complement: production.address_complement || "",
        address_reference: production.address_reference || "",
        formatted_address: production.formatted_address || "",
        latitude: production.latitude || "",
        longitude: production.longitude || "",
        place_id: production.place_id || "",
        google_maps_url: production.google_maps_url || "",
        location_public: Boolean(production.location_public),
        website_url: production.website_url || "",
        instagram_url: production.instagram_url || "",
      });
      setLogoPreview(media(production.logo));
      setBgPreview(media(production.background));
      setEvents(Array.isArray(workspace?.events) ? workspace.events : []);
      setAnalytics(workspace?.analytics || { total_views: 0, unique_viewers: 0, viewers: [] });
      setGalleryMedia(Array.isArray(workspace?.media) ? workspace.media : []);
      setGalleryAlbums(Array.isArray(workspace?.gallery?.albums) ? workspace.gallery.albums : []);
    }).catch((err) => {
      if (active) setError(err?.message || "Não foi possível carregar a produção.");
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [id]);

  useEffect(() => () => {
    if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    if (bgPreview?.startsWith("blob:")) URL.revokeObjectURL(bgPreview);
  }, [logoPreview, bgPreview]);

  const nameInvalid = submitted && (!form?.name || form.name.trim().length < 2);
  const cnpjDigits = String(form?.cnpj || "").replace(/\D/g, "");
  const cnpjInvalid = submitted && cnpjDigits !== "" && cnpjDigits.length !== 14;
  const canSave = useMemo(() => Boolean(form?.name?.trim()) && !saving, [form, saving]);

  const persistProduction = async (nextForm, { includeFiles = false, silent = false } = {}) => {
    if (!nextForm || !productionIsValid(nextForm)) return false;
    setSaving(true);
    setError("");
    if (!silent) setSuccess("");

    try {
      const data = new FormData();
      ["name","fantasy","cnpj","phone","description","city","uf","address","website_url","instagram_url"].forEach((key) => {
        data.append(key, nextForm[key] ?? "");
      });
      if (includeFiles && logo) data.append("logo", logo);
      if (includeFiles && background) data.append("background", background);

      const response = await cutinappService.updateProduction(id, data);
      const profile = {};
      experienceKeys.forEach((key) => { profile[key] = nextForm[key] === "" ? null : nextForm[key]; });
      profile.location_public = Boolean(nextForm.location_public);
      await cutinappService.updateProductionExperience(id, profile);

      if (response?.production) {
        setProductionMeta((current) => ({ ...current, ...response.production }));
        if (includeFiles && logo && response.production.logo) setLogoPreview(media(response.production.logo));
        if (includeFiles && background && response.production.background) setBgPreview(media(response.production.background));
      }

      if (includeFiles) {
        setLogo(null);
        setBackground(null);
      }

      if (!silent) setSuccess("Alterações salvas. A página pública já está atualizada.");
      return true;
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível salvar a produção.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const { status: autoSaveStatus, lastSavedAt, saveError: autoSaveError, flush: flushAutoSave } = useAutoSave({
    value: form,
    enabled: Boolean(form) && !loading,
    delay: 800,
    validate: productionIsValid,
    onSave: (nextForm) => persistProduction(nextForm, { includeFiles: false, silent: true }),
  });

  useEffect(() => {
    if (autoSaveError) setError(autoSaveError?.message || "Não foi possível salvar automaticamente.");
  }, [autoSaveError]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "uf" ? value.toUpperCase().slice(0, 2) : value,
    }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const chooseFile = (setter, previewSetter, field) => (event) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    setter(selected);
    previewSetter((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(selected);
    });
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const submit = async (event) => {
    event?.preventDefault?.();
    setSubmitted(true);
    setError("");
    setFieldErrors({});

    if (!productionIsValid(form)) {
      setError("Revise os campos destacados antes de salvar.");
      return;
    }

    try {
      await persistProduction(form, { includeFiles: true, silent: false });
    } catch {
      // persistProduction already exposes the error to the page.
    }
  };

  const handleFormBlur = (event) => {
    const element = event.target;
    if (!element || element.type === "file" || element.type === "submit" || element.type === "button") return;
    flushAutoSave();
  };

  const mapQuery = useMemo(() => {
    if (!form?.location_public) return "";
    if (form.latitude && form.longitude) return `${form.latitude},${form.longitude}`;
    return form.formatted_address || [
      form.address,
      form.address_number,
      form.neighborhood,
      form.city,
      form.uf,
    ].filter(Boolean).join(", ");
  }, [form]);

  if (loading) {
    return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Abrindo editor da produção" /></div>;
  }

  if (!form) {
    return <div className="cut-app-page"><NavlogComponent /><Container className="py-5"><Alert variant="danger">{error || "Produção não encontrada."}</Alert></Container></div>;
  }

  const displayName = form.name?.trim() || "Sua produção";
  const location = [form.city, form.uf].filter(Boolean).join(" - ");
  const publicSlug = productionMeta?.slug;
  const pageBackground = bgPreview || logoPreview;
  const pageStyle = pageBackground ? { "--cut-production-page-bg": `url(${JSON.stringify(pageBackground)})` } : undefined;
  const heroStyle = bgPreview ? {
    backgroundImage: `linear-gradient(90deg,rgba(2,8,13,.82),rgba(2,8,13,.42) 55%,rgba(2,8,13,.24)),linear-gradient(180deg,rgba(2,8,13,.08),rgba(2,8,13,.64)),url("${bgPreview}")`,
    backgroundPosition: "center",
    backgroundSize: "cover",
  } : undefined;
  const mapEmbedUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : "";
  const pendingImages = Boolean(logo || background);

  return (
    <Form className="cut-app-page cut-production-themed-page cut-production-inline-editor" style={pageStyle} onSubmit={submit} onBlur={handleFormBlur} noValidate>
      <NavlogComponent />
      {saving && pendingImages && <ProcessingIndicatorComponent label="Salvando imagens da produção" />}

      <section className="cut-profile-hero cut-production-themed-page__hero cut-production-inline-editor__hero" style={heroStyle}>
        <input
          id="production-inline-cover"
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          data-pt-image-enhancer="off"
          data-media-library="off"
          aria-label="Selecionar capa da produção"
          onChange={chooseFile(setBackground, setBgPreview, "background")}
        />
        <input
          id="production-inline-logo"
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          data-pt-image-enhancer="off"
          data-media-library="off"
          aria-label="Selecionar logo da produção"
          onChange={chooseFile(setLogo, setLogoPreview, "logo")}
        />

        <Container className="cut-page-container">
          <div className="cut-production-inline-editor__modebar">
            <div className="cut-production-inline-editor__modecopy">
              <span className="cut-production-inline-editor__modepill"><i className="fa-regular fa-pen-to-square" /> Modo edição</span>
              <span className={`cut-production-inline-editor__saveState is-${autoSaveStatus || "idle"}`}>
                {pendingImages ? "Capa/logo aguardando salvar" : autosaveLabel(autoSaveStatus)}
              </span>
              {lastSavedAt && !pendingImages && <small>último salvamento {lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}
            </div>
            <div className="cut-production-inline-editor__modeActions">
              {publicSlug && <Button type="button" variant="outline-light" onClick={() => navigate(`/production/${publicSlug}/public`)}><i className="fa-regular fa-eye me-2" />Ver página</Button>}
              <Button type="button" onClick={submit} disabled={!canSave}><i className="fa-solid fa-check me-2" />{saving ? "Salvando..." : "Salvar agora"}</Button>
            </div>
          </div>

          <div className="cut-profile-hero__content">
            <div className="cut-production-inline-editor__avatarWrap">
              <div className="cut-profile-avatar cut-profile-avatar--square">
                {logoPreview ? <img src={logoPreview} alt={displayName} /> : <span>{initials(displayName)}</span>}
              </div>
              <label className="cut-production-inline-editor__imageButton is-logo" htmlFor="production-inline-logo" title="Trocar logo" aria-label="Trocar logo da produção">
                <i className="fa-solid fa-camera" />
              </label>
            </div>

            <div className="cut-production-inline-editor__heroCopy">
              <span className="cut-eyebrow">Produção Cutinapp</span>
              <Form.Control
                name="name"
                value={form.name}
                onChange={change}
                className="cut-production-inline-editor__titleInput"
                aria-label="Nome da produção"
                isInvalid={nameInvalid || Boolean(firstError(fieldErrors, "name"))}
              />
              {(nameInvalid || firstError(fieldErrors, "name")) && <div className="cut-production-inline-editor__fieldError">{firstError(fieldErrors, "name") || "Informe um nome com pelo menos 2 caracteres."}</div>}

              <div className="cut-production-inline-editor__locationLine">
                <Form.Control name="city" value={form.city} onChange={change} placeholder="Cidade" aria-label="Cidade" />
                <span>-</span>
                <Form.Control name="uf" value={form.uf} onChange={change} placeholder="UF" aria-label="Estado" maxLength={2} />
              </div>

              <div className="cut-social-stats">
                <span>{productionMeta?.followers_count || 0} seguidores</span>
                <span><i className="fa-regular fa-eye" /> {analytics.total_views || 0} visualizações</span>
                <span>{events.length} próximos eventos</span>
              </div>

              <div className="cut-card-actions mt-3 cut-production-inline-editor__heroActions">
                <label className="btn btn-outline-light" htmlFor="production-inline-cover">
                  <i className="fa-regular fa-image me-2" />{bgPreview ? "Trocar capa" : "Adicionar capa"}
                </label>
                <Button type="button" variant="outline-light" onClick={() => setEditDetails((value) => !value)}>
                  <i className="fa-solid fa-sliders me-2" />Dados e links
                </Button>
                {form.instagram_url && <span className="cut-production-icon-link cut-production-icon-link--instagram" title="Instagram"><i className="fa-brands fa-instagram" /></span>}
                {form.website_url && <span className="cut-production-icon-link" title="Site"><i className="fa-solid fa-globe" /></span>}
              </div>
            </div>
          </div>
        </Container>
      </section>

      <Container className="cut-page-container py-5">
        {error && <Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert>}
        {!error && success && <Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert>}

        {editDetails && (
          <Card className="cut-panel cut-production-inline-editor__adminPanel mb-4">
            <Card.Body className="p-4">
              <div className="cut-production-inline-editor__sectionHead">
                <div>
                  <span className="cut-eyebrow">Dados da produção</span>
                  <h2 className="cut-section-title mt-2">Informações administrativas e links</h2>
                  <p>Esses dados continuam editáveis sem tirar você da página da produção.</p>
                </div>
                <Button type="button" variant="outline-light" onClick={() => setEditDetails(false)}><i className="fa-solid fa-xmark me-2" />Fechar</Button>
              </div>
              <Row className="g-3">
                <Col md={6}><Form.Group><Form.Label>Nome fantasia</Form.Label><Form.Control name="fantasy" value={form.fantasy} onChange={change} /></Form.Group></Col>
                <Col md={3}><Form.Group><Form.Label>Tipo</Form.Label><Form.Select name="type" value={form.type} onChange={change}><option value="independent">Produção independente</option><option value="fixed">Espaço fixo / casa própria</option></Form.Select></Form.Group></Col>
                <Col md={3}><Form.Group><Form.Label>CNPJ</Form.Label><Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={cnpjInvalid} /><Form.Control.Feedback type="invalid">Se informar CNPJ, use os 14 números.</Form.Control.Feedback></Form.Group></Col>
                <Col md={4}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} /></Form.Group></Col>
                <Col md={4}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control name="instagram_url" value={form.instagram_url} onChange={change} placeholder="https://instagram.com/..." /></Form.Group></Col>
                <Col md={4}><Form.Group><Form.Label>Site</Form.Label><Form.Control name="website_url" value={form.website_url} onChange={change} placeholder="https://..." /></Form.Group></Col>
              </Row>
            </Card.Body>
          </Card>
        )}

        <div className="cut-production-public-about">
          <Card className="cut-panel cut-production-inline-editor__viewCard">
            <Card.Body className="p-4 p-lg-5">
              <div className="cut-production-inline-editor__sectionHead">
                <div>
                  <span className="cut-eyebrow">Sobre a produção</span>
                  <h2 className="cut-section-title mt-2">{form.fantasy?.trim() || displayName}</h2>
                </div>
                <Button type="button" variant="outline-light" size="sm" onClick={() => setEditAbout((value) => !value)}>
                  <i className={`fa-solid ${editAbout ? "fa-eye" : "fa-pen"} me-2`} />{editAbout ? "Ver como fica" : "Editar texto"}
                </Button>
              </div>

              {editAbout ? (
                <div className="cut-production-inline-editor__inlinePanel">
                  <FormattedTextEditor
                    value={form.description}
                    onChange={(description) => setForm((current) => ({ ...current, description }))}
                    placeholder="Conte o que torna esta produção ou espaço especial."
                    maxLength={10000}
                    rows={9}
                    ariaLabel="Descrição formatada da produção"
                  />
                  <small>Você continua na própria página. Ao fechar o editor, o texto volta a ser exibido exatamente como o público verá.</small>
                </div>
              ) : (
                <FormattedText className="cut-body-copy" value={form.description} emptyText="Clique em “Editar texto” para escrever a apresentação da produção." />
              )}

              <div className="cut-production-public-social">
                {form.instagram_url && <span className="btn btn-outline-light disabled"><i className="fa-brands fa-instagram me-2" />Instagram</span>}
                {form.website_url && <span className="btn btn-outline-light disabled"><i className="fa-solid fa-globe me-2" />Site</span>}
              </div>
            </Card.Body>
          </Card>

          <Card className="cut-panel cut-production-location-card cut-production-inline-editor__viewCard">
            <Card.Body className="p-4">
              <div className="cut-production-inline-editor__sectionHead">
                <div>
                  <span className="cut-eyebrow">Localização</span>
                  <h2 className="cut-section-title mt-2">Onde acontece</h2>
                </div>
                <Button type="button" variant="outline-light" size="sm" onClick={() => setEditLocation((value) => !value)}>
                  <i className={`fa-solid ${editLocation ? "fa-eye" : "fa-location-dot"} me-2`} />{editLocation ? "Ver mapa" : "Editar local"}
                </Button>
              </div>

              {editLocation ? (
                <div className="cut-production-inline-editor__inlinePanel cut-production-inline-editor__locationEditor">
                  <LocationFields value={form} onChange={setForm} showPublicToggle />
                </div>
              ) : mapEmbedUrl ? (
                <>
                  <div className="cut-production-location-copy"><i className="fa-solid fa-location-dot" /><span>{form.formatted_address || [form.address, form.address_number, form.city, form.uf].filter(Boolean).join(", ")}</span></div>
                  <iframe title={`Mapa de ${displayName}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" src={mapEmbedUrl} />
                </>
              ) : (
                <div className="cut-production-inline-editor__emptyView">
                  <i className="fa-solid fa-location-dot" />
                  <p>{form.location_public ? "Informe o endereço para visualizar o mapa." : "A localização está oculta na página pública."}</p>
                  <Button type="button" variant="outline-light" size="sm" onClick={() => setEditLocation(true)}>Configurar localização</Button>
                </div>
              )}
            </Card.Body>
          </Card>
        </div>

        <section className="cut-production-section cut-production-agenda-section">
          <div className="cut-production-section-head cut-production-agenda-head">
            <div>
              <span className="cut-eyebrow">Agenda</span>
              <h2>Próximos eventos</h2>
              <p className="cut-production-agenda-copy">Esta área permanece igual à página pública para você visualizar o resultado enquanto edita a produção.</p>
            </div>
            <Button type="button" variant="outline-light" onClick={() => navigate("/event/manage")}><i className="fa-regular fa-calendar-days me-2" />Gerenciar eventos</Button>
          </div>

          {events.length === 0 ? (
            <Card className="cut-empty-state"><Card.Body><p>Nenhum evento cadastrado nesta produção ainda.</p></Card.Body></Card>
          ) : (
            <div className="cut-production-events-carousel">
              {events.slice(0, 12).map((event) => (
                <article className="cut-production-event-slide" key={event.id}>
                  <div className="cut-production-event-slide__media">
                    <EventArtwork image={event.image} title={event.title} alt={event.title} loading="lazy" decoding="async" fallbackClassName="cut-production-event-slide__fallback" />
                  </div>
                  <div className="cut-production-event-slide__body">
                    <span className="cut-eyebrow">{event.category || "Evento"}</span>
                    <h3>{event.title}</h3>
                    <div className="cut-production-event-meta">
                      <p><i className="fa-regular fa-clock" />{fmt(event.start_date)}</p>
                      <p><i className="fa-solid fa-location-dot" />{event.venue || event.city || "Local a definir"}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <ProductionGallery
          media={galleryMedia}
          albums={galleryAlbums}
          productionName={displayName}
          productionType={form.type}
          isOwner
          onManage={() => setGalleryManagerOpen((value) => !value)}
        />

        {galleryManagerOpen && (
          <section id="production-editor-gallery" className="cut-production-inline-editor__galleryManager">
            <div className="cut-production-inline-editor__sectionHead">
              <div>
                <span className="cut-eyebrow">Editar galeria</span>
                <h2>Gerencie as fotos sem sair da página</h2>
              </div>
              <Button type="button" variant="outline-light" onClick={() => setGalleryManagerOpen(false)}><i className="fa-regular fa-eye me-2" />Voltar à visualização</Button>
            </div>
            <ProductionGalleryManager
              organizationId={id}
              productionName={displayName}
              productionType={form.type}
              media={galleryMedia}
              albums={galleryAlbums}
              publicSlug={publicSlug}
              coverUrl={bgPreview}
              onMediaChange={setGalleryMedia}
              onAlbumsChange={setGalleryAlbums}
              onCoverChange={(cover) => {
                const nextBackground = cover?.background || cover?.url || "";
                if (nextBackground) setBgPreview(media(nextBackground));
                if (cover?.path) setProductionMeta((current) => ({ ...current, background: cover.path }));
              }}
            />
          </section>
        )}

        <div className="cut-production-inline-editor__footerActions">
          <div>
            <strong>Você está editando a própria página da produção.</strong>
            <span>As alterações de texto usam salvamento automático. Capa e logo são publicadas ao clicar em “Salvar agora”.</span>
          </div>
          <div>
            {publicSlug && <Button type="button" variant="outline-light" onClick={() => navigate(`/production/${publicSlug}/public`)}>Ver página pública</Button>}
            <Button type="button" onClick={submit} disabled={!canSave}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
          </div>
        </div>
      </Container>
    </Form>
  );
}
