import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EntityEditorShell, { EditorSection } from "../../components/editor/EntityEditorShell";
import { FormattedText, FormattedTextEditor } from "../../components/editor/FormattedText";
import LocationFields from "../../components/location/LocationFields";
import ProductionGalleryManager from "../../components/production/ProductionGalleryManager";
import useAutoSave from "../../hooks/useAutoSave";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";
import "./production-editor.css";

const media = (path) => !path ? "" : /^https?:\/\//i.test(path) ? path : `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
const firstError = (errors, field) => Array.isArray(errors?.[field]) ? errors[field][0] || "" : typeof errors?.[field] === "string" ? errors[field] : "";
const experienceKeys = ["type","city_id","city","uf","cep","address","address_number","neighborhood","address_complement","address_reference","formatted_address","latitude","longitude","place_id","google_maps_url","location_public"];
const sections = [
  { key: "production-editor-media", label: "Capa e logo", icon: "fa-regular fa-image" },
  { key: "production-editor-identity", label: "Identidade", icon: "fa-regular fa-id-card" },
  { key: "production-editor-about", label: "Sobre", icon: "fa-regular fa-align-left" },
  { key: "production-editor-location", label: "Localização", icon: "fa-solid fa-location-dot" },
  { key: "production-editor-social", label: "Contato e links", icon: "fa-solid fa-link" },
  { key: "production-editor-gallery", label: "Galeria", icon: "fa-regular fa-images" },
];

const productionIsValid = (value) => {
  if (!value?.name || value.name.trim().length < 2) return false;
  const cnpjDigits = String(value.cnpj || "").replace(/\D/g, "");
  if (cnpjDigits !== "" && cnpjDigits.length !== 14) return false;
  return true;
};

const autosaveLabel = (status) => {
  if (status === "saving") return "Salvando...";
  if (status === "saved") return "Salvo automaticamente";
  if (status === "dirty") return "Alterações pendentes";
  if (status === "error") return "Falha ao salvar";
  return "Salvamento automático ativo";
};

const initials = (name) => String(name || "P").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function ProductionUpdatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [productionMeta, setProductionMeta] = useState(null);
  const [activeSection, setActiveSection] = useState(sections[0].key);
  const [logo, setLogo] = useState(null);
  const [background, setBackground] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bgPreview, setBgPreview] = useState("");
  const [galleryMedia, setGalleryMedia] = useState([]);
  const [galleryAlbums, setGalleryAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    cutinappService.productionWorkspace(id).then((workspace) => {
      const production = workspace?.organization || workspace?.production;
      if (!active || !production) return;
      setProductionMeta(production);
      setForm({
        name: production.name || "", fantasy: production.fantasy || "", type: production.type || "independent",
        cnpj: production.cnpj || "", phone: production.phone || "", description: production.description || "",
        city_id: production.city_id || "", city: production.city || "", uf: production.uf || "", cep: production.cep || "",
        address: production.address || "", address_number: production.address_number || "", neighborhood: production.neighborhood || "",
        address_complement: production.address_complement || "", address_reference: production.address_reference || "",
        formatted_address: production.formatted_address || "", latitude: production.latitude || "", longitude: production.longitude || "",
        place_id: production.place_id || "", google_maps_url: production.google_maps_url || "", location_public: Boolean(production.location_public),
        website_url: production.website_url || "", instagram_url: production.instagram_url || "",
      });
      setLogoPreview(media(production.logo));
      setBgPreview(media(production.background));
      setGalleryMedia(Array.isArray(workspace?.media) ? workspace.media : []);
      setGalleryAlbums(Array.isArray(workspace?.gallery?.albums) ? workspace.gallery.albums : []);
    }).catch((err) => active && setError(err?.message || "Não foi possível carregar a produção."))
      .finally(() => active && setLoading(false));
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
        const value = nextForm[key];
        if (value !== null && String(value).trim() !== "") data.append(key, value);
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
        setSuccess("Alterações salvas com sucesso.");
      }
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

  useEffect(() => {
    const syncSectionFromHash = () => {
      const hash = String(window.location.hash || "").replace(/^#/, "");
      if (sections.some((section) => section.key === hash)) {
        setActiveSection(hash);
        window.requestAnimationFrame(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    };
    syncSectionFromHash();
    window.addEventListener("hashchange", syncSectionFromHash);
    return () => window.removeEventListener("hashchange", syncSectionFromHash);
  }, []);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === "uf" ? value.toUpperCase().slice(0, 2) : value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current }; delete next[name]; return next;
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
      const next = { ...current }; delete next[field]; return next;
    });
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setError("");
    setFieldErrors({});
    if (!productionIsValid(form)) {
      setError("Revise os campos destacados antes de salvar.");
      return;
    }
    try { await persistProduction(form, { includeFiles: true, silent: false }); } catch { /* mensagem já exibida */ }
  };

  const saveImages = async () => {
    setSubmitted(true);
    setError("");
    setFieldErrors({});
    if (!productionIsValid(form)) {
      setError("Revise os campos destacados antes de salvar as imagens.");
      return;
    }
    try { await persistProduction(form, { includeFiles: true, silent: false }); } catch { /* mensagem já exibida */ }
  };

  const handleFormBlur = (event) => {
    const element = event.target;
    if (!element || element.type === "file" || element.type === "submit" || element.type === "button") return;
    flushAutoSave();
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando produção" /></div>;
  if (!form) return <div className="cut-app-page"><NavlogComponent /><div className="container py-5"><Alert variant="danger">{error || "Produção não encontrada."}</Alert></div></div>;

  const displayName = form.fantasy?.trim() || form.name?.trim() || "Sua produção";
  const location = [form.city, form.uf].filter(Boolean).join(" - ");
  const publicSlug = productionMeta?.slug;
  const previewStyle = bgPreview ? { backgroundImage: `linear-gradient(90deg,rgba(2,8,13,.94),rgba(2,8,13,.62) 55%,rgba(2,8,13,.32)),linear-gradient(180deg,rgba(2,8,13,.06),rgba(2,8,13,.92)),url("${bgPreview}")` } : undefined;
  const editorSections = sections.map((section) => section.key === "production-editor-gallery"
    ? { ...section, label: `Galeria · ${galleryMedia.length}` }
    : section);

  const preview = (
    <div className="cut-production-live-preview">
      <section className={`cut-production-live-hero ${bgPreview ? "has-cover" : "is-empty"}`} style={previewStyle}>
        <input
          id="production-background-upload-top"
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          data-pt-image-enhancer="off"
          data-media-library="off"
          aria-label="Selecionar capa da produção"
          onChange={chooseFile(setBackground, setBgPreview, "background")}
        />
        <input
          id="production-logo-upload-top"
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          data-pt-image-enhancer="off"
          data-media-library="off"
          aria-label="Selecionar logo da produção"
          onChange={chooseFile(setLogo, setLogoPreview, "logo")}
        />

        <div className="cut-production-live-hero__actions" aria-label="Editar imagens do topo">
          {(logo || background) && <span className="cut-production-live-hero__pending"><i className="fa-solid fa-circle" /> Imagem pronta para salvar</span>}
          <label className="btn btn-light cut-production-live-hero__coverButton" htmlFor="production-background-upload-top">
            <i className="fa-regular fa-image me-2" />
            {bgPreview ? "Trocar capa" : "Adicionar capa"}
          </label>
          {(logo || background) && (
            <Button type="button" onClick={saveImages} disabled={saving}>
              {saving ? <><i className="fa-solid fa-spinner fa-spin me-2" />Salvando...</> : <><i className="fa-solid fa-check me-2" />Salvar imagens</>}
            </Button>
          )}
        </div>

        <div className="cut-production-live-hero__content">
          <div className="cut-production-live-hero__avatarWrap">
            <div className="cut-production-live-hero__avatar">
              {logoPreview ? <img src={logoPreview} alt={`Logo de ${displayName}`} /> : <span>{initials(displayName)}</span>}
            </div>
            <label className="cut-production-live-hero__logoButton" htmlFor="production-logo-upload-top" aria-label={logoPreview ? "Trocar logo da produção" : "Adicionar logo da produção"} title={logoPreview ? "Trocar logo" : "Adicionar logo"}>
              <i className="fa-solid fa-camera" />
            </label>
          </div>

          <div className="cut-production-live-hero__copy">
            <span className="cut-eyebrow">Produção Cutinapp · prévia ao vivo</span>
            <h2>{displayName}</h2>
            <p>{location || "Adicione cidade e estado para completar o topo da página."}</p>
            <div className="cut-production-live-hero__meta">
              <span><i className="fa-regular fa-calendar" /> {productionMeta?.events_count || 0} eventos</span>
              <span><i className="fa-regular fa-user" /> {productionMeta?.followers_count || 0} seguidores</span>
              <span><i className="fa-regular fa-eye" /> Página pública</span>
            </div>
          </div>
        </div>

        {!bgPreview && (
          <div className="cut-production-live-hero__emptyHint">
            <i className="fa-solid fa-panorama" />
            <strong>Sua capa começa aqui</strong>
            <span>Use uma imagem horizontal. O botão “Adicionar capa” fica sempre visível no topo do editor.</span>
          </div>
        )}
      </section>

      <div className="cut-production-live-preview__body">
        <article className="cut-production-live-preview__card">
          <span className="cut-eyebrow">Sobre a produção</span>
          <h3>{form.fantasy?.trim() || displayName}</h3>
          <FormattedText
            className="cut-production-live-preview__description"
            value={form.description}
            emptyText="A descrição formatada aparecerá aqui, no mesmo contexto em que o público vai ler."
          />
        </article>

        <article className="cut-production-live-preview__card">
          <span className="cut-eyebrow">Onde encontrar</span>
          <h3>{location || "Localização ainda não informada"}</h3>
          <p>{form.address || form.formatted_address || "Endereço, mapa e referências aparecem nesta área da página."}</p>
          <div className="cut-production-live-preview__links">
            {form.instagram_url && <span><i className="fa-brands fa-instagram" /> Instagram</span>}
            {form.website_url && <span><i className="fa-solid fa-globe" /> Site</span>}
          </div>
        </article>

        <article className="cut-production-live-preview__card cut-production-live-preview__galleryCard">
          <div className="cut-production-live-preview__galleryHead">
            <div>
              <span className="cut-eyebrow">{form.type === "fixed" ? "Fotos do espaço" : "Galeria"}</span>
              <h3>{galleryMedia.length ? `${galleryMedia.length} foto${galleryMedia.length === 1 ? "" : "s"} publicada${galleryMedia.length === 1 ? "" : "s"}` : "Sua galeria aparecerá aqui"}</h3>
            </div>
          </div>
          {galleryMedia.length > 0 ? (
            <div className="cut-production-live-preview__galleryStrip">
              {galleryMedia.slice(0, 5).map((item, index) => (
                <img key={item.id} src={media(item.url)} alt={item.caption || `Foto ${index + 1} de ${displayName}`} loading="lazy" />
              ))}
            </div>
          ) : (
            <p>Adicione fotos na seção Galeria para visualizar a composição da página antes de sair do editor.</p>
          )}
        </article>
      </div>
    </div>
  );

  return <div className="cut-app-page"><NavlogComponent />{saving && (logo || background) && <ProcessingIndicatorComponent label="Salvando imagens da produção" />}
    {error && <div className="container cut-page-container pt-3"><Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert></div>}
    {!error && success && <div className="container cut-page-container pt-3"><Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert></div>}
    <Form onSubmit={submit} onBlur={handleFormBlur} noValidate>
      <EntityEditorShell
        eyebrow="Editar produção"
        title={displayName}
        description="Edite a produção vendo, no mesmo contexto, como identidade, localização, descrição e imagens aparecem para o público."
        sections={editorSections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        status={autoSaveStatus}
        statusLabel={autosaveLabel(autoSaveStatus)}
        lastSavedAt={lastSavedAt}
        preview={preview}
        previewLabel="Página da produção enquanto você edita"
        previewPlacement="top"
        secondaryActions={<><Button type="button" variant="outline-light" onClick={() => navigate(`/production/${id}`)}>Gerenciar</Button>{publicSlug && <Button type="button" variant="outline-light" onClick={() => navigate(`/production/${publicSlug}/public`)}>Ver página</Button>}</>}
        primaryAction={<Button type="submit" disabled={!canSave}>{saving ? "Salvando..." : logo || background ? "Salvar imagens" : "Salvar agora"}</Button>}
      >
        <EditorSection id="production-editor-media" eyebrow="Topo da página" title="Capa e logo" hint="Essas duas imagens formam o hero da produção. Você também pode trocá-las diretamente na prévia acima.">
          <Row className="g-4">
            <Col md={5} data-image-upload-scope="production-logo">
              <Form.Group>
                <Form.Label>Logo</Form.Label>
                {logoPreview && <img className="cut-upload-preview cut-upload-preview--logo mb-3" src={logoPreview} alt="Prévia da logo" />}
                <Form.Control
                  id="production-logo-upload"
                  name="production_logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  data-image-kind="logo"
                  data-label="logo da produção"
                  aria-label="Selecionar logo da produção"
                  onChange={chooseFile(setLogo, setLogoPreview, "logo")}
                />
                <Form.Text>Use uma imagem nítida, preferencialmente quadrada, que continue legível em tamanhos pequenos.</Form.Text>
              </Form.Group>
            </Col>
            <Col md={7} data-image-upload-scope="production-background">
              <Form.Group>
                <Form.Label>Capa</Form.Label>
                {bgPreview && <img className="cut-upload-preview mb-3" src={bgPreview} alt="Prévia da capa" />}
                <Form.Control
                  id="production-background-upload"
                  name="production_background"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  data-image-kind="cover"
                  data-label="capa da produção"
                  aria-label="Selecionar capa da produção"
                  onChange={chooseFile(setBackground, setBgPreview, "background")}
                />
                <Form.Text>Prefira imagem horizontal. O enquadramento acima reproduz o hero usado na página da produção.</Form.Text>
              </Form.Group>
            </Col>
          </Row>
          {(logo || background) && (
            <div className="cut-production-editor-media-actions">
              <span><i className="fa-solid fa-circle-info" /> A prévia já foi atualizada. Salve para publicar as novas imagens.</span>
              <Button type="button" onClick={saveImages} disabled={saving}>
                {saving ? "Salvando..." : "Salvar capa e logo"}
              </Button>
            </div>
          )}
        </EditorSection>

        <EditorSection id="production-editor-identity" eyebrow="Topo da view" title="Identidade" hint="Nome, tipo e dados que identificam a produção para o público.">
          <Row className="g-3">
            <Col md={7}><Form.Group><Form.Label>Nome *</Form.Label><Form.Control name="name" value={form.name} onChange={change} isInvalid={nameInvalid || Boolean(firstError(fieldErrors,"name"))} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors,"name") || "Informe um nome com pelo menos 2 caracteres."}</Form.Control.Feedback></Form.Group></Col>
            <Col md={5}><Form.Group><Form.Label>Nome fantasia</Form.Label><Form.Control name="fantasy" value={form.fantasy} onChange={change} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Tipo de produção</Form.Label><Form.Select name="type" value={form.type} onChange={change}><option value="independent">Produção independente</option><option value="fixed">Espaço fixo / casa própria</option></Form.Select></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>CNPJ</Form.Label><Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={cnpjInvalid} /><Form.Control.Feedback type="invalid">Se informar CNPJ, use os 14 números.</Form.Control.Feedback></Form.Group></Col>
          </Row>
        </EditorSection>

        <EditorSection id="production-editor-about" eyebrow="Seção Sobre" title="Apresentação" hint="Este texto aparece logo após o topo da página pública.">
          <Form.Group>
            <Form.Label>Descrição da produção</Form.Label>
            <FormattedTextEditor
              value={form.description}
              onChange={(description) => setForm((current) => ({ ...current, description }))}
              placeholder="Conte o que torna esta produção ou espaço especial. Use títulos, listas e destaques para deixar a leitura mais clara."
              maxLength={10000}
              rows={9}
              ariaLabel="Descrição formatada da produção"
            />
            <Form.Text>Use negrito, itálico, títulos, listas, citações, links e separadores. A prévia mostra exatamente como o texto será exibido ao público.</Form.Text>
          </Form.Group>
        </EditorSection>

        <EditorSection id="production-editor-location" eyebrow="Seção Localização" title="Onde acontece" hint="Os dados abaixo alimentam endereço, mapa e contexto geográfico da view.">
          <LocationFields value={form} onChange={setForm} showPublicToggle />
        </EditorSection>

        <EditorSection id="production-editor-social" eyebrow="Ações da view" title="Contato e links" hint="Links públicos ficam próximos às ações principais da produção.">
          <Row className="g-3">
            <Col md={6}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control name="instagram_url" value={form.instagram_url} onChange={change} placeholder="@usuario ou URL" /></Form.Group></Col>
            <Col xs={12}><Form.Group><Form.Label>Site</Form.Label><Form.Control name="website_url" value={form.website_url} onChange={change} placeholder="https://..." /></Form.Group></Col>
          </Row>
        </EditorSection>

        <EditorSection
          id="production-editor-gallery"
          eyebrow="Imagens da produção"
          title={form.type === "fixed" ? "Fotos do espaço" : "Galeria da produção"}
          hint="Gerencie as fotos como uma biblioteca visual: envie em lote, edite legendas, reorganize, crie álbuns e escolha destaques sem perder o contexto da página pública."
        >
          <ProductionGalleryManager
            organizationId={id}
            productionName={displayName}
            productionType={form.type}
            media={galleryMedia}
            albums={galleryAlbums}
            publicSlug={publicSlug}
            onMediaChange={setGalleryMedia}
            onAlbumsChange={setGalleryAlbums}
            onCoverChange={(cover) => {
              if (cover?.background) setBgPreview(cover.background);
              if (cover?.path) setProductionMeta((current) => ({ ...current, background: cover.path }));
            }}
          />
        </EditorSection>
      </EntityEditorShell>
    </Form>
  </div>;
}
