import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import LocationFields from "../../components/location/LocationFields";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const media = (path) => !path ? "" : /^https?:\/\//i.test(path) ? path : `${storageUrl}${String(path).replace(/^\/?storage\//, "").replace(/^\//, "")}`;
const firstError = (errors, field) => Array.isArray(errors?.[field]) ? errors[field][0] || "" : typeof errors?.[field] === "string" ? errors[field] : "";
const experienceKeys = ["type","city_id","city","uf","cep","address","address_number","neighborhood","address_complement","address_reference","formatted_address","latitude","longitude","place_id","google_maps_url","location_public"];

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
      setLogoPreview(media(production.logo)); setBgPreview(media(production.background));
    }).catch((err) => active && setError(err?.message || "Não foi possível carregar a produção."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const nameInvalid = submitted && (!form?.name || form.name.trim().length < 2);
  const cnpjDigits = String(form?.cnpj || "").replace(/\D/g, "");
  const cnpjInvalid = submitted && cnpjDigits !== "" && cnpjDigits.length !== 14;
  const locationInvalid = submitted && Boolean((form?.city || form?.uf) && !form?.city_id);
  const canSave = useMemo(() => Boolean(form?.name?.trim()) && !saving, [form, saving]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: name === "uf" ? value.toUpperCase().slice(0, 2) : value }));
    setFieldErrors((current) => { if (!current[name]) return current; const next = { ...current }; delete next[name]; return next; });
  };
  const chooseFile = (setter, previewSetter, field) => (event) => {
    const selected = event.target.files?.[0] || null; setter(selected); if (selected) previewSetter(URL.createObjectURL(selected));
    setFieldErrors((current) => { if (!current[field]) return current; const next = { ...current }; delete next[field]; return next; });
  };

  const submit = async (event) => {
    event.preventDefault(); setSubmitted(true); setError(""); setFieldErrors({});
    if (!canSave || nameInvalid || cnpjInvalid || locationInvalid) { setError(locationInvalid ? "Selecione a cidade pela lista oficial antes de salvar." : "Revise os campos destacados antes de salvar."); return; }
    setSaving(true);
    try {
      const data = new FormData();
      ["name","fantasy","cnpj","phone","description","city","uf","address","website_url","instagram_url"].forEach((key) => { const value = form[key]; if (value !== null && String(value).trim() !== "") data.append(key, value); });
      if (logo) data.append("logo", logo); if (background) data.append("background", background);
      await cutinappService.updateProduction(id, data);
      const profile = {}; experienceKeys.forEach((key) => { profile[key] = form[key] === "" ? null : form[key]; }); profile.location_public = Boolean(form.location_public);
      await cutinappService.updateProductionExperience(id, profile);
      navigate(`/production/${id}`, { replace: true, state: { updated: true } });
    } catch (err) { setFieldErrors(err?.errors || {}); setError(err?.message || "Não foi possível salvar a produção."); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando produção" /></div>;
  return <div className="cut-app-page"><NavlogComponent />{saving && <ProcessingIndicatorComponent label="Salvando produção" />}<Container className="cut-page-container py-4 py-lg-5"><div className="cut-page-heading"><div><span className="cut-eyebrow">Área do produtor</span><h1>Editar produção</h1><p>Atualize a identidade, o tipo da produção e o local que o público poderá encontrar.</p></div><Button variant="outline-light" disabled={saving} onClick={() => navigate(`/production/${id}`)}>Voltar</Button></div>{error && <Alert variant="danger">{error}</Alert>}
    {form && <Form onSubmit={submit} noValidate><Row className="g-4"><Col lg={8}><Card className="cut-panel"><Card.Body className="p-4 p-lg-5"><span className="cut-eyebrow">Identidade</span><h2 className="cut-section-title mt-2">Dados da produção</h2><Row className="g-3"><Col md={7}><Form.Group><Form.Label>Nome *</Form.Label><Form.Control name="name" value={form.name} onChange={change} isInvalid={nameInvalid || Boolean(firstError(fieldErrors,"name"))} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors,"name") || "Informe um nome com pelo menos 2 caracteres."}</Form.Control.Feedback></Form.Group></Col><Col md={5}><Form.Group><Form.Label>Nome fantasia</Form.Label><Form.Control name="fantasy" value={form.fantasy} onChange={change} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Tipo de produção</Form.Label><Form.Select name="type" value={form.type} onChange={change}><option value="independent">Produção independente</option><option value="fixed">Espaço fixo / casa própria</option></Form.Select></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>CNPJ</Form.Label><Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={cnpjInvalid} /><Form.Control.Feedback type="invalid">Se informar CNPJ, use os 14 números.</Form.Control.Feedback></Form.Group></Col><Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={4} name="description" value={form.description} onChange={change} /></Form.Group></Col></Row>
    <h2 className="cut-section-title mt-4">Localização</h2><LocationFields value={form} onChange={setForm} showPublicToggle />{locationInvalid && <Alert variant="warning" className="mt-3">Selecione a cidade na lista de resultados.</Alert>}<Row className="g-3 mt-1"><Col md={6}><Form.Group><Form.Label>Site</Form.Label><Form.Control name="website_url" value={form.website_url} onChange={change} /></Form.Group></Col><Col md={6}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control name="instagram_url" value={form.instagram_url} onChange={change} placeholder="@usuario ou URL" /></Form.Group></Col></Row></Card.Body></Card></Col>
    <Col lg={4}><Card className="cut-panel"><Card.Body className="p-4"><span className="cut-eyebrow">Marca</span><h2 className="cut-section-title mt-2">Imagens</h2><Form.Group className="mb-3"><Form.Label>Logo</Form.Label>{logoPreview && <img className="cut-upload-preview cut-upload-preview--logo" src={logoPreview} alt="Logo" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile(setLogo,setLogoPreview,"logo")} /></Form.Group><Form.Group><Form.Label>Capa</Form.Label>{bgPreview && <img className="cut-upload-preview" src={bgPreview} alt="Capa" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile(setBackground,setBgPreview,"background")} /></Form.Group><Button type="submit" className="w-100 mt-4" disabled={!canSave}>{saving ? "Salvando..." : "Salvar alterações"}</Button></Card.Body></Card></Col></Row></Form>}
  </Container></div>;
}
