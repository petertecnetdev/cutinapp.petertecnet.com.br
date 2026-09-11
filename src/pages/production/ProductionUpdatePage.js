import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EntityEditorShell, { EditorSection } from "../../components/editor/EntityEditorShell";
import LocationFields from "../../components/location/LocationFields";
import useAutoSave from "../../hooks/useAutoSave";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const media = (path) => !path ? "" : /^https?:\/\//i.test(path) ? path : `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
const firstError = (errors, field) => Array.isArray(errors?.[field]) ? errors[field][0] || "" : typeof errors?.[field] === "string" ? errors[field] : "";
const experienceKeys = ["type","city_id","city","uf","cep","address","address_number","neighborhood","address_complement","address_reference","formatted_address","latitude","longitude","place_id","google_maps_url","location_public"];
const sections = [
  { key: "production-editor-identity", label: "Identidade", icon: "fa-regular fa-id-card" },
  { key: "production-editor-about", label: "Sobre", icon: "fa-regular fa-align-left" },
  { key: "production-editor-location", label: "Localização", icon: "fa-solid fa-location-dot" },
  { key: "production-editor-social", label: "Contato e links", icon: "fa-solid fa-link" },
  { key: "production-editor-media", label: "Logo e capa", icon: "fa-regular fa-image" },
];

const productionIsValid = (value) => {
  if (!value?.name || value.name.trim().length < 2) return false;
  const cnpjDigits = String(value.cnpj || "").replace(/\D/g, "");
  if (cnpjDigits !== "" && cnpjDigits.length !== 14) return false;
  if ((value.city || value.uf) && !value.city_id) return false;
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
  const locationInvalid = submitted && Boolean((form?.city || form?.uf) && !form?.city_id);
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

      if (response?.production) setProductionMeta((current) => ({ ...current, ...response.production }));
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
      setError(locationInvalid ? "Selecione a cidade pela lista oficial antes de salvar." : "Revise os campos destacados antes de salvar.");
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
  const previewStyle = bgPreview ? { backgroundImage: `url("${bgPreview}")` } : undefined;

  const preview = (
    <>
      <div className="cut-editor-preview-hero" style={previewStyle}>
        <div className="cut-editor-preview-hero__content">
          <div className="cut-editor-preview-avatar is-square">
            {logoPreview ? <img src={logoPreview} alt="" /> : <span>{initials(displayName)}</span>}
          </div>
          <div className="cut-editor-preview-copy">
            <span className="cut-eyebrow">Produção Cutinapp</span>
            <h3>{displayName}</h3>
            <p>{location || "Cidade e localização aparecem aqui"}</p>
            <div className="cut-editor-preview-meta">
              <span><i className="fa-regular fa-calendar me-1" />Eventos</span>
              <span><i className="fa-regular fa-eye me-1" />Visualizações</span>
            </div>
          </div>
        </div>
      </div>
      <div className="cut-editor-preview-body">
        <h4>Sobre a produção</h4>
        <p>{form.description?.trim() || "Sua descrição aparecerá aqui na página pública."}</p>
        {(form.instagram_url || form.website_url) && <div className="cut-editor-preview-meta">{form.instagram_url && <span><i className="fa-brands fa-instagram me-1" />Instagram</span>}{form.website_url && <span><i className="fa-solid fa-globe me-1" />Site</span>}</div>}
      </div>
    </>
  );

  return <div className="cut-app-page"><NavlogComponent />{saving && (logo || background) && <ProcessingIndicatorComponent label="Salvando imagens da produção" />}
    {error && <div className="container cut-page-container pt-3"><Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert></div>}
    {!error && success && <div className="container cut-page-container pt-3"><Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert></div>}
    <Form onSubmit={submit} onBlur={handleFormBlur} noValidate>
      <EntityEditorShell
        eyebrow="Editar produção"
        title={displayName}
        description="Edite a produção vendo, no mesmo contexto, como identidade, localização, descrição e imagens aparecem para o público."
        sections={sections}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        status={autoSaveStatus}
        statusLabel={autosaveLabel(autoSaveStatus)}
        lastSavedAt={lastSavedAt}
        preview={preview}
        previewLabel="Prévia da página da produção"
        secondaryActions={<><Button type="button" variant="outline-light" onClick={() => navigate(`/production/${id}`)}>Gerenciar</Button>{publicSlug && <Button type="button" variant="outline-light" onClick={() => navigate(`/production/${publicSlug}/public`)}>Ver página</Button>}</>}
        primaryAction={<Button type="submit" disabled={!canSave}>{saving ? "Salvando..." : logo || background ? "Salvar imagens" : "Salvar agora"}</Button>}
      >
        <EditorSection id="production-editor-identity" eyebrow="Topo da view" title="Identidade" hint="Nome, tipo e dados que identificam a produção para o público.">
          <Row className="g-3">
            <Col md={7}><Form.Group><Form.Label>Nome *</Form.Label><Form.Control name="name" value={form.name} onChange={change} isInvalid={nameInvalid || Boolean(firstError(fieldErrors,"name"))} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors,"name") || "Informe um nome com pelo menos 2 caracteres."}</Form.Control.Feedback></Form.Group></Col>
            <Col md={5}><Form.Group><Form.Label>Nome fantasia</Form.Label><Form.Control name="fantasy" value={form.fantasy} onChange={change} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Tipo de produção</Form.Label><Form.Select name="type" value={form.type} onChange={change}><option value="independent">Produção independente</option><option value="fixed">Espaço fixo / casa própria</option></Form.Select></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>CNPJ</Form.Label><Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={cnpjInvalid} /><Form.Control.Feedback type="invalid">Se informar CNPJ, use os 14 números.</Form.Control.Feedback></Form.Group></Col>
          </Row>
        </EditorSection>

        <EditorSection id="production-editor-about" eyebrow="Seção Sobre" title="Apresentação" hint="Este texto aparece logo após o topo da página pública.">
          <Form.Group><Form.Label>Descrição da produção</Form.Label><Form.Control as="textarea" rows={6} name="description" value={form.description} onChange={change} placeholder="Conte o que torna esta produção ou espaço especial." /></Form.Group>
        </EditorSection>

        <EditorSection id="production-editor-location" eyebrow="Seção Localização" title="Onde acontece" hint="Os dados abaixo alimentam endereço, mapa e contexto geográfico da view.">
          <LocationFields value={form} onChange={setForm} showPublicToggle />
          {locationInvalid && <Alert variant="warning" className="mt-3 mb-0">Selecione a cidade na lista de resultados.</Alert>}
        </EditorSection>

        <EditorSection id="production-editor-social" eyebrow="Ações da view" title="Contato e links" hint="Links públicos ficam próximos às ações principais da produção.">
          <Row className="g-3">
            <Col md={6}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} /></Form.Group></Col>
            <Col md={6}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control name="instagram_url" value={form.instagram_url} onChange={change} placeholder="@usuario ou URL" /></Form.Group></Col>
            <Col xs={12}><Form.Group><Form.Label>Site</Form.Label><Form.Control name="website_url" value={form.website_url} onChange={change} placeholder="https://..." /></Form.Group></Col>
          </Row>
        </EditorSection>

        <EditorSection id="production-editor-media" eyebrow="Topo da view" title="Logo e capa" hint="A capa compõe o fundo do hero e a logo representa a produção em toda a Cutinapp.">
          <Row className="g-4">
            <Col md={5}><Form.Group><Form.Label>Logo</Form.Label>{logoPreview && <img className="cut-upload-preview cut-upload-preview--logo mb-3" src={logoPreview} alt="Prévia da logo" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile(setLogo,setLogoPreview,"logo")} /><Form.Text>Use uma imagem nítida que continue legível em tamanhos pequenos.</Form.Text></Form.Group></Col>
            <Col md={7}><Form.Group><Form.Label>Capa</Form.Label>{bgPreview && <img className="cut-upload-preview mb-3" src={bgPreview} alt="Prévia da capa" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile(setBackground,setBgPreview,"background")} /><Form.Text>Prefira imagem horizontal. A prévia lateral mostra o recorte usado no topo.</Form.Text></Form.Group></Col>
          </Row>
        </EditorSection>
      </EntityEditorShell>
    </Form>
  </div>;
}
