import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import LocationFields from "../../components/location/LocationFields";
import useAutoSave from "../../hooks/useAutoSave";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const media = (path) => !path ? "" : /^https?:\/\//i.test(path) ? path : `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
const firstError = (errors, field) => Array.isArray(errors?.[field]) ? errors[field][0] || "" : typeof errors?.[field] === "string" ? errors[field] : "";
const experienceKeys = ["type","city_id","city","uf","cep","address","address_number","neighborhood","address_complement","address_reference","formatted_address","latitude","longitude","place_id","google_maps_url","location_public"];

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

export default function ProductionUpdatePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
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
    cutinappService.productionWorkspace(id).then(({ organization: production }) => {
      if (!active) return;
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

      await cutinappService.updateProduction(id, data);

      const profile = {};
      experienceKeys.forEach((key) => { profile[key] = nextForm[key] === "" ? null : nextForm[key]; });
      profile.location_public = Boolean(nextForm.location_public);
      await cutinappService.updateProductionExperience(id, profile);

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

  const {
    status: autoSaveStatus,
    lastSavedAt,
    saveError: autoSaveError,
    flush: flushAutoSave,
  } = useAutoSave({
    value: form,
    enabled: Boolean(form) && !loading,
    delay: 800,
    validate: productionIsValid,
    onSave: (nextForm) => persistProduction(nextForm, { includeFiles: false, silent: true }),
  });

  useEffect(() => {
    if (!autoSaveError) return;
    setError(autoSaveError?.message || "Não foi possível salvar automaticamente.");
  }, [autoSaveError]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === "uf" ? value.toUpperCase().slice(0, 2) : value }));
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const chooseFile = (setter, previewSetter, field) => (event) => {
    const selected = event.target.files?.[0] || null;
    setter(selected);
    if (selected) previewSetter(URL.createObjectURL(selected));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
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

    try {
      await persistProduction(form, { includeFiles: true, silent: false });
    } catch {
      // persistProduction já apresenta o erro correto na tela.
    }
  };

  const handleFormBlur = (event) => {
    const element = event.target;
    if (!element || element.type === "file" || element.type === "submit" || element.type === "button") return;
    flushAutoSave();
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando produção" /></div>;

  return <div className="cut-app-page"><NavlogComponent /><Container className="cut-page-container py-4 py-lg-5"><div className="cut-page-heading"><div><span className="cut-eyebrow">Área do produtor</span><h1>Editar produção</h1><p>Atualize os dados normalmente. A Cutinapp salva enquanto você digita e imediatamente quando sai do campo.</p></div><div className="d-flex flex-column align-items-end gap-2"><Button variant="outline-light" disabled={saving} onClick={() => navigate(`/production/${id}`)}>Voltar</Button><Badge bg={autoSaveStatus === "error" ? "danger" : autoSaveStatus === "dirty" ? "warning" : autoSaveStatus === "saving" ? "info" : "success"}>{autosaveLabel(autoSaveStatus)}</Badge>{lastSavedAt && <small className="text-secondary">Último salvamento: {lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}</div></div>{error && <Alert variant="danger">{error}</Alert>}{success && <Alert variant="success">{success}</Alert>}
    {form && <Form onSubmit={submit} onBlur={handleFormBlur} noValidate><Row className="g-4"><Col lg={8}><Card className="cut-panel"><Card.Body className="p-4 p-lg-5"><span className="cut-eyebrow">Identidade</span><h2 className="cut-section-title mt-2">Dados da produção</h2><Row className="g-3"><Col md={7}><Form.Group><Form.Label>Nome *</Form.Label><Form.Control name="name" value={form.name} onChange={change} isInvalid={nameInvalid || Boolean(firstError(fieldErrors,"name"))} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors,"name") || "Informe um nome com pelo menos 2 caracteres."}</Form.Control.Feedback></Form.Group></Col><Col md={5}><Form.Group><Form.Label>Nome fantasia</Form.Label><Form.Control name="fantasy" value={form.fantasy} onChange={change} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Tipo de produção</Form.Label><Form.Select name="type" value={form.type} onChange={change}><option value="independent">Produção independente</option><option value="fixed">Espaço fixo / casa própria</option></Form.Select></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>CNPJ</Form.Label><Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={cnpjInvalid} /><Form.Control.Feedback type="invalid">Se informar CNPJ, use os 14 números.</Form.Control.Feedback></Form.Group></Col><Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={4} name="description" value={form.description} onChange={change} /></Form.Group></Col></Row>
    <h2 className="cut-section-title mt-4">Localização</h2><LocationFields value={form} onChange={setForm} showPublicToggle />{locationInvalid && <Alert variant="warning" className="mt-3">Selecione a cidade na lista de resultados.</Alert>}<Row className="g-3 mt-1"><Col md={6}><Form.Group><Form.Label>Site</Form.Label><Form.Control name="website_url" value={form.website_url} onChange={change} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control name="instagram_url" value={form.instagram_url} onChange={change} placeholder="@usuario ou URL" /></Form.Group></Col></Row></Card.Body></Card></Col>
    <Col lg={4}><Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Marca</span><h2 className="cut-section-title mt-2">Imagens</h2><Form.Group className="mb-3"><Form.Label>Logo</Form.Label>{logoPreview && <img className="cut-upload-preview cut-upload-preview--logo" src={logoPreview} alt="Logo" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile(setLogo,setLogoPreview,"logo")} /></Form.Group><Form.Group><Form.Label>Capa</Form.Label>{bgPreview && <img className="cut-upload-preview" src={bgPreview} alt="Capa" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile(setBackground,setBgPreview,"background")} /></Form.Group><Form.Text className="d-block mt-3">Os textos e a localização são salvos automaticamente. Use o botão abaixo apenas para confirmar novos arquivos de imagem.</Form.Text><Button type="submit" className="w-100 mt-3" disabled={!canSave}>{saving ? "Salvando..." : logo || background ? "Salvar imagens agora" : "Salvar agora"}</Button></Card.Body></Card></Col></Row></Form>}
  </Container></div>;
}
