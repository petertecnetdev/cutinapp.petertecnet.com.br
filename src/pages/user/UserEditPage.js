import React, { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import EntityEditorShell, { EditorSection } from "../../components/editor/EntityEditorShell";
import useAutoSave from "../../hooks/useAutoSave";
import userService from "../../services/UserService";
import { storageUrl } from "../../config";
import "./UserEditPage.css";

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  city: "",
  uf: "",
  postal_code: "",
  address: "",
  about: "",
};

const sections = [
  { key: "profile-editor-appearance", label: "Foto e capa", icon: "fa-regular fa-image" },
  { key: "profile-editor-identity", label: "Identidade", icon: "fa-regular fa-id-card" },
  { key: "profile-editor-contact", label: "Contato", icon: "fa-regular fa-envelope" },
  { key: "profile-editor-location", label: "Localização", icon: "fa-solid fa-location-dot" },
  { key: "profile-editor-about", label: "Sobre", icon: "fa-regular fa-align-left" },
  { key: "profile-editor-security", label: "Segurança", icon: "fa-solid fa-shield-halved" },
];

const image = (value) => !value ? "" : /^https?:/.test(value) ? value : `${storageUrl}${String(value).replace(/^\//, "")}`;
const acceptedImageTypes = ["image/png", "image/jpeg", "image/webp"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const profileIsValid = (value) => Boolean(
  value?.first_name?.trim() && value?.email?.trim() && emailPattern.test(value.email.trim())
);

const autosaveLabel = (status) => {
  if (status === "saving") return "Salvando...";
  if (status === "saved") return "Salvo automaticamente";
  if (status === "dirty") return "Alterações pendentes";
  if (status === "error") return "Falha ao salvar";
  return "Salvamento automático ativo";
};

export default function UserEditPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useContext(AuthContext);
  const [form, setForm] = useState(emptyForm);
  const [activeSection, setActiveSection] = useState(sections[0].key);
  const [avatar, setAvatar] = useState(null);
  const [preview, setPreview] = useState("");
  const [background, setBackground] = useState(null);
  const [backgroundPreview, setBackgroundPreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      phone: user.phone || "",
      city: user.city || "",
      uf: user.uf || "",
      postal_code: user.postal_code || "",
      address: user.address || "",
      about: user.about || "",
    });
    setPreview(image(user.avatar));
    setBackgroundPreview(image(user.background));
  }, [user]);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    if (backgroundPreview?.startsWith("blob:")) URL.revokeObjectURL(backgroundPreview);
  }, [preview, backgroundPreview]);

  const persistProfile = async (nextForm, { includeFiles = false, silent = false } = {}) => {
    if (!user?.id || loading || !profileIsValid(nextForm)) return false;
    setLoading(true);
    setError("");
    if (!silent) setSuccess("");
    try {
      const payload = new FormData();
      Object.entries(nextForm).forEach(([key, value]) => payload.append(key, value ?? ""));
      if (includeFiles && avatar) payload.append("avatar", avatar);
      if (includeFiles && background) payload.append("background", background);

      const response = await userService.update(user.id, payload);
      await refreshUser();

      if (includeFiles) {
        setAvatar(null);
        setBackground(null);
        setSuccess(response?.message || "Dados atualizados com sucesso.");
      }
      return true;
    } catch (err) {
      setError(err?.message || "Não foi possível atualizar sua conta.");
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const { status: autoSaveStatus, lastSavedAt, saveError: autoSaveError, flush: flushAutoSave } = useAutoSave({
    value: form,
    enabled: Boolean(user?.id),
    delay: 800,
    validate: profileIsValid,
    onSave: (nextForm) => persistProfile(nextForm, { includeFiles: false, silent: true }),
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
  };

  const pickImage = ({ maxMb, label, setter, previewSetter }) => (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!acceptedImageTypes.includes(file.type) || file.size > maxMb * 1024 * 1024) {
      setError(`${label} deve ser PNG, JPG ou WEBP de até ${maxMb} MB.`);
      event.target.value = "";
      return;
    }
    setError("");
    setter(file);
    previewSetter((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  const chooseAvatar = pickImage({ maxMb: 4, label: "A foto do perfil", setter: setAvatar, previewSetter: setPreview });
  const chooseBackground = pickImage({ maxMb: 8, label: "A capa", setter: setBackground, previewSetter: setBackgroundPreview });

  const submit = async (event) => {
    event.preventDefault();
    if (!user?.id || loading) return;
    if (!profileIsValid(form)) {
      setError("Informe nome e e-mail válidos antes de salvar.");
      return;
    }
    try { await persistProfile(form, { includeFiles: true, silent: false }); } catch { /* mensagem já exibida */ }
  };

  const handleFormBlur = (event) => {
    const element = event.target;
    if (!element || element.type === "file" || element.type === "submit" || element.type === "button") return;
    flushAutoSave();
  };

  const displayName = useMemo(() => [form.first_name, form.last_name].filter(Boolean).join(" ").trim() || "Seu perfil", [form.first_name, form.last_name]);
  const initials = String(form.first_name || user?.first_name || "C").slice(0, 2).toUpperCase();
  const location = [form.city, form.uf].filter(Boolean).join(" - ");
  const previewStyle = backgroundPreview ? { backgroundImage: `url("${backgroundPreview}")` } : undefined;

  const profilePreview = (
    <>
      <div className="cut-editor-preview-hero" style={previewStyle}>
        <div className="cut-editor-preview-hero__content">
          <div className="cut-editor-preview-avatar">
            {preview ? <img src={preview} alt="" /> : <span>{initials}</span>}
          </div>
          <div className="cut-editor-preview-copy">
            <span className="cut-eyebrow">Perfil Cutinapp</span>
            <h3>{displayName}</h3>
            <p>{location || "Sua cidade aparece aqui"}</p>
            <div className="cut-editor-preview-meta">
              <span><i className="fa-regular fa-user me-1" />Perfil</span>
              <span><i className="fa-regular fa-message me-1" />Mensagem</span>
            </div>
          </div>
        </div>
      </div>
      <div className="cut-editor-preview-body">
        <h4>Sobre {form.first_name || "você"}</h4>
        <p>{form.about?.trim() || "Sua bio aparecerá aqui para outras pessoas entenderem rapidamente quem você é."}</p>
      </div>
    </>
  );

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && (avatar || background) && <ProcessingIndicatorComponent label="Salvando imagens do perfil" />}
      {error && <div className="container cut-page-container pt-3"><Alert variant="danger" dismissible onClose={() => setError("")}>{error}</Alert></div>}
      {!error && success && <div className="container cut-page-container pt-3"><Alert variant="success" dismissible onClose={() => setSuccess("")}>{success}</Alert></div>}

      <Form onSubmit={submit} onBlur={handleFormBlur}>
        <EntityEditorShell
          eyebrow="Editar perfil"
          title={displayName}
          description="Edite seu perfil na mesma ordem em que as pessoas enxergam sua página: aparência, identidade, localização e apresentação."
          sections={sections}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
          status={autoSaveStatus}
          statusLabel={autosaveLabel(autoSaveStatus)}
          lastSavedAt={lastSavedAt}
          preview={profilePreview}
          previewLabel="Prévia do seu perfil"
          secondaryActions={<><Button type="button" variant="outline-light" onClick={() => navigate("/profile")}>Ver perfil</Button><Button type="button" variant="outline-light" onClick={() => navigate("/password")}>Senha</Button></>}
          primaryAction={<Button type="submit" disabled={loading}>{avatar || background ? "Salvar imagens" : "Salvar agora"}</Button>}
        >
          <EditorSection id="profile-editor-appearance" eyebrow="Topo da view" title="Foto e capa" hint="Estas imagens compõem o hero principal do seu perfil.">
            <Row className="g-4">
              <Col md={5}>
                <Form.Group>
                  <Form.Label>Foto do perfil</Form.Label>
                  <div className="cut-account-avatar mb-3">{preview ? <img src={preview} alt="Seu avatar" /> : <span>{initials}</span>}</div>
                  <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} />
                  <Form.Text>PNG, JPG ou WEBP de até 4 MB.</Form.Text>
                </Form.Group>
              </Col>
              <Col md={7}>
                <Form.Group>
                  <Form.Label>Capa do perfil</Form.Label>
                  {backgroundPreview ? <img src={backgroundPreview} alt="Prévia da capa" className="cut-upload-preview mb-3" /> : <div className="cut-upload-placeholder mb-3"><i className="fa-regular fa-image" /><span>Adicione uma capa horizontal</span></div>}
                  <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseBackground} />
                  <Form.Text>PNG, JPG ou WEBP de até 8 MB. A prévia mostra o recorte usado na view.</Form.Text>
                </Form.Group>
              </Col>
            </Row>
          </EditorSection>

          <EditorSection id="profile-editor-identity" eyebrow="Identidade pública" title="Nome" hint="É assim que seu nome aparece no topo do perfil e nas interações.">
            <Row className="g-3">
              <Col md={6}><Form.Group><Form.Label>Nome</Form.Label><Form.Control name="first_name" value={form.first_name} onChange={change} required /></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Sobrenome</Form.Label><Form.Control name="last_name" value={form.last_name} onChange={change} /></Form.Group></Col>
            </Row>
          </EditorSection>

          <EditorSection id="profile-editor-contact" eyebrow="Conta e contato" title="Como falar com você" hint="Dados de conta e contato ficam agrupados, sem misturar com a identidade pública.">
            <Row className="g-3">
              <Col md={7}><Form.Group><Form.Label>E-mail</Form.Label><Form.Control type="email" name="email" value={form.email} onChange={change} required /></Form.Group></Col>
              <Col md={5}><Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} /></Form.Group></Col>
            </Row>
          </EditorSection>

          <EditorSection id="profile-editor-location" eyebrow="Contexto do perfil" title="Localização" hint="Cidade e UF aparecem no topo do perfil; endereço completo permanece como dado de conta.">
            <Row className="g-3">
              <Col md={7}><Form.Group><Form.Label>Endereço</Form.Label><Form.Control name="address" value={form.address} onChange={change} /></Form.Group></Col>
              <Col md={5}><Form.Group><Form.Label>CEP</Form.Label><Form.Control name="postal_code" value={form.postal_code} onChange={change} /></Form.Group></Col>
              <Col md={9}><Form.Group><Form.Label>Cidade</Form.Label><Form.Control name="city" value={form.city} onChange={change} /></Form.Group></Col>
              <Col md={3}><Form.Group><Form.Label>UF</Form.Label><Form.Control name="uf" maxLength={2} value={form.uf} onChange={change} /></Form.Group></Col>
            </Row>
          </EditorSection>

          <EditorSection id="profile-editor-about" eyebrow="Aba Sobre" title="Sua apresentação" hint="A bio aparece na seção Sobre do perfil e ajuda outros usuários a entenderem quem você é.">
            <Form.Group><Form.Label>Sobre você</Form.Label><Form.Control as="textarea" rows={6} name="about" value={form.about} onChange={change} placeholder="Conte um pouco sobre você, seus interesses e sua relação com eventos." /></Form.Group>
          </EditorSection>

          <EditorSection id="profile-editor-security" eyebrow="Conta" title="Segurança" hint="Ações sensíveis ficam separadas do conteúdo público do perfil.">
            <div className="d-flex flex-wrap gap-2">
              <Button type="button" variant="outline-light" onClick={() => navigate("/password")}><i className="fa-solid fa-key me-2" />Alterar senha</Button>
              <Button type="button" variant="outline-light" onClick={() => navigate("/profile")}><i className="fa-regular fa-eye me-2" />Abrir meu perfil</Button>
            </div>
          </EditorSection>
        </EntityEditorShell>
      </Form>
    </div>
  );
}
