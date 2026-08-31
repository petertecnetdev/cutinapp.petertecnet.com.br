import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const media = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${storageUrl}${String(path).replace(/^\//, "")}`;
};

const firstError = (errors, field) => {
  const value = errors?.[field];
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
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
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    cutinappService.getProduction(id)
      .then((production) => {
        if (!active) return;
        setForm({
          name: production.name || "",
          fantasy: production.fantasy || "",
          cnpj: production.cnpj || "",
          phone: production.phone || "",
          description: production.description || "",
          city: production.city || "",
          uf: production.uf || "",
          address: production.address || "",
          website_url: production.website_url || "",
          instagram_url: production.instagram_url || "",
        });
        setLogoPreview(media(production.logo));
        setBgPreview(media(production.background));
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar a produção."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const nameInvalid = submitted && (!form?.name || form.name.trim().length < 2);
  const ufInvalid = submitted && Boolean(form?.uf) && form.uf.trim().length !== 2;
  const cnpjDigits = String(form?.cnpj || "").replace(/\D/g, "");
  const cnpjInvalid = submitted && cnpjDigits !== "" && cnpjDigits.length !== 14;
  const canSave = useMemo(() => Boolean(form?.name?.trim()) && !saving, [form, saving]);

  const change = (event) => {
    const { name, value } = event.target;
    const normalized = name === "uf" ? value.toUpperCase().slice(0, 2) : value;
    setForm((current) => ({ ...current, [name]: normalized }));
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

    if (!canSave || nameInvalid || ufInvalid || cnpjInvalid) {
      setError("Revise os campos destacados antes de salvar.");
      return;
    }

    setSaving(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== null && String(value).trim() !== "") data.append(key, value);
      });
      if (logo) data.append("logo", logo);
      if (background) data.append("background", background);

      const response = await cutinappService.updateProduction(id, data);
      if (Number(response?.production?.id || 0) !== Number(id)) {
        throw new Error("A API não confirmou a produção atualizada.");
      }
      navigate(`/production/${id}`, { replace: true, state: { updated: true } });
    } catch (err) {
      setFieldErrors(err?.errors || {});
      setError(err?.message || "Não foi possível salvar a produção.");
    } finally {
      setSaving(false);
    }
  };

  const invalid = (field, local = false) => Boolean(local || firstError(fieldErrors, field));

  if (loading) {
    return <div className="cut-app-page"><NavlogComponent /><ProcessingIndicatorComponent label="Carregando produção" /></div>;
  }

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {saving && <ProcessingIndicatorComponent label="Salvando produção" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div><span className="cut-eyebrow">Área do produtor</span><h1>Editar produção</h1><p>Atualize os dados e confirme a persistência voltando ao detalhe da produção.</p></div>
          <Button variant="outline-light" disabled={saving} onClick={() => navigate(`/production/${id}`)}>Voltar</Button>
        </div>
        {error && <Alert variant="danger">{error}</Alert>}

        {form && <Form onSubmit={submit} noValidate>
          <Row className="g-4">
            <Col lg={8}>
              <Card className="cut-panel"><Card.Body className="p-4 p-lg-5">
                <span className="cut-eyebrow">Identidade</span><h2 className="cut-section-title mt-2">Dados da produção</h2>
                <Row className="g-3">
                  <Col md={7}><Form.Group><Form.Label>Nome *</Form.Label><Form.Control name="name" value={form.name} onChange={change} isInvalid={invalid("name", nameInvalid)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "name") || "Informe um nome com pelo menos 2 caracteres."}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={5}><Form.Group><Form.Label>Nome fantasia</Form.Label><Form.Control name="fantasy" value={form.fantasy} onChange={change} isInvalid={invalid("fantasy")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "fantasy")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>CNPJ</Form.Label><Form.Control name="cnpj" value={form.cnpj} onChange={change} inputMode="numeric" isInvalid={invalid("cnpj", cnpjInvalid)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "cnpj") || "Se informar CNPJ, use os 14 números."}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} isInvalid={invalid("phone")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "phone")}</Form.Control.Feedback></Form.Group></Col>
                  <Col xs={12}><Form.Group><Form.Label>Descrição</Form.Label><Form.Control as="textarea" rows={5} name="description" value={form.description} onChange={change} isInvalid={invalid("description")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "description")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Cidade</Form.Label><Form.Control name="city" value={form.city} onChange={change} isInvalid={invalid("city")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "city")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={2}><Form.Group><Form.Label>UF</Form.Label><Form.Control name="uf" maxLength={2} value={form.uf} onChange={change} isInvalid={invalid("uf", ufInvalid)} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "uf") || "Use 2 letras."}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={4}><Form.Group><Form.Label>Endereço</Form.Label><Form.Control name="address" value={form.address} onChange={change} isInvalid={invalid("address")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "address")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Site</Form.Label><Form.Control type="text" name="website_url" value={form.website_url} onChange={change} isInvalid={invalid("website_url")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "website_url")}</Form.Control.Feedback></Form.Group></Col>
                  <Col md={6}><Form.Group><Form.Label>Instagram</Form.Label><Form.Control type="text" name="instagram_url" value={form.instagram_url} onChange={change} placeholder="@usuario ou URL" isInvalid={invalid("instagram_url")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "instagram_url")}</Form.Control.Feedback></Form.Group></Col>
                </Row>
              </Card.Body></Card>
            </Col>
            <Col lg={4}>
              <Card className="cut-panel"><Card.Body className="p-4">
                <span className="cut-eyebrow">Marca</span><h2 className="cut-section-title mt-2">Imagens</h2>
                <Form.Group className="mb-3"><Form.Label>Logo</Form.Label>{logoPreview && <img className="cut-upload-preview cut-upload-preview--logo" src={logoPreview} alt="Logo" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile(setLogo, setLogoPreview, "logo")} isInvalid={invalid("logo")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "logo")}</Form.Control.Feedback></Form.Group>
                <Form.Group><Form.Label>Capa</Form.Label>{bgPreview && <img className="cut-upload-preview" src={bgPreview} alt="Capa" />}<Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile(setBackground, setBgPreview, "background")} isInvalid={invalid("background")} /><Form.Control.Feedback type="invalid">{firstError(fieldErrors, "background")}</Form.Control.Feedback></Form.Group>
                <Button type="submit" className="w-100 mt-4" disabled={!canSave}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
              </Card.Body></Card>
            </Col>
          </Row>
        </Form>}
      </Container>
    </div>
  );
}
