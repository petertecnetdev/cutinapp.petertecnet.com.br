import React, { useContext, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
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

  const {
    status: autoSaveStatus,
    lastSavedAt,
    saveError: autoSaveError,
    flush: flushAutoSave,
  } = useAutoSave({
    value: form,
    enabled: Boolean(user?.id),
    delay: 800,
    validate: profileIsValid,
    onSave: (nextForm) => persistProfile(nextForm, { includeFiles: false, silent: true }),
  });

  useEffect(() => {
    if (!autoSaveError) return;
    setError(autoSaveError?.message || "Não foi possível salvar automaticamente.");
  }, [autoSaveError]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: name === "uf" ? value.toUpperCase().slice(0, 2) : value,
    }));
  };

  const chooseAvatar = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!acceptedImageTypes.includes(file.type) || file.size > 4 * 1024 * 1024) {
      setError("A foto do perfil deve ser PNG, JPG ou WEBP de até 4 MB.");
      event.target.value = "";
      return;
    }
    setError("");
    setAvatar(file);
    setPreview(URL.createObjectURL(file));
  };

  const chooseBackground = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) return;
    if (!acceptedImageTypes.includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError("A capa deve ser PNG, JPG ou WEBP de até 8 MB.");
      event.target.value = "";
      return;
    }
    setError("");
    setBackground(file);
    setBackgroundPreview(URL.createObjectURL(file));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!user?.id || loading) return;

    if (!profileIsValid(form)) {
      setError("Informe nome e e-mail válidos antes de salvar.");
      return;
    }

    try {
      await persistProfile(form, { includeFiles: true, silent: false });
    } catch {
      // persistProfile já apresenta o erro correto na tela.
    }
  };

  const handleFormBlur = (event) => {
    const element = event.target;
    if (!element || element.type === "file" || element.type === "submit" || element.type === "button") return;
    flushAutoSave();
  };

  const initials = String(user?.first_name || "C").slice(0, 2).toUpperCase();

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && (avatar || background) && <ProcessingIndicatorComponent label="Salvando imagens do perfil" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Minha conta</span>
            <h1>Dados pessoais</h1>
            <p>Digite normalmente. Seus dados são salvos automaticamente enquanto você edita e ao sair de cada campo.</p>
          </div>
          <div className="d-flex flex-column align-items-end gap-2">
            <Button variant="outline-light" onClick={() => navigate("/password")}>Alterar senha</Button>
            <Badge bg={autoSaveStatus === "error" ? "danger" : autoSaveStatus === "dirty" ? "warning" : autoSaveStatus === "saving" ? "info" : "success"}>{autosaveLabel(autoSaveStatus)}</Badge>
            {lastSavedAt && <small className="text-secondary">Último salvamento: {lastSavedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</small>}
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <Form onSubmit={submit} onBlur={handleFormBlur}>
          <Card className="cut-panel cut-account-cover-card mb-4">
            <div
              className={`cut-account-cover${backgroundPreview ? " has-image" : ""}`}
              style={backgroundPreview ? { backgroundImage: `url("${backgroundPreview}")` } : undefined}
            >
              <div className="cut-account-cover__overlay" />
              <div className="cut-account-cover__content">
                <div>
                  <span className="cut-eyebrow">Capa do perfil</span>
                  <strong>Mostre sua identidade na Cutinapp</strong>
                  <small>Recomendado: imagem horizontal, PNG, JPG ou WEBP de até 8 MB.</small>
                </div>
                <Form.Label htmlFor="profile-background" className="btn btn-light cut-account-cover__action mb-0">
                  <i className="fa-regular fa-image me-2" />{backgroundPreview ? "Trocar capa" : "Escolher capa"}
                </Form.Label>
                <Form.Control
                  id="profile-background"
                  className="visually-hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={chooseBackground}
                />
              </div>
            </div>
          </Card>

          <Row className="g-4">
            <Col lg={4}>
              <Card className="cut-panel h-100">
                <Card.Body className="p-4 text-center">
                  <div className="cut-account-avatar mx-auto">
                    {preview ? <img src={preview} alt="Seu avatar" /> : <span>{initials}</span>}
                  </div>
                  <Form.Group className="mt-4 text-start">
                    <Form.Label>Foto do perfil</Form.Label>
                    <Form.Control type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} />
                    <Form.Text>PNG, JPG ou WEBP de até 4 MB. Arquivos são enviados apenas ao confirmar.</Form.Text>
                  </Form.Group>
                </Card.Body>
              </Card>
            </Col>

            <Col lg={8}>
              <Card className="cut-panel">
                <Card.Body className="p-4">
                  <Row className="g-3">
                    <Col md={6}>
                      <Form.Group><Form.Label>Nome</Form.Label><Form.Control name="first_name" value={form.first_name} onChange={change} required /></Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group><Form.Label>Sobrenome</Form.Label><Form.Control name="last_name" value={form.last_name} onChange={change} /></Form.Group>
                    </Col>
                    <Col md={7}>
                      <Form.Group><Form.Label>E-mail</Form.Label><Form.Control type="email" name="email" value={form.email} onChange={change} required /></Form.Group>
                    </Col>
                    <Col md={5}>
                      <Form.Group><Form.Label>Telefone</Form.Label><Form.Control name="phone" value={form.phone} onChange={change} /></Form.Group>
                    </Col>
                    <Col md={7}>
                      <Form.Group><Form.Label>Endereço</Form.Label><Form.Control name="address" value={form.address} onChange={change} /></Form.Group>
                    </Col>
                    <Col md={5}>
                      <Form.Group><Form.Label>CEP</Form.Label><Form.Control name="postal_code" value={form.postal_code} onChange={change} /></Form.Group>
                    </Col>
                    <Col md={9}>
                      <Form.Group><Form.Label>Cidade</Form.Label><Form.Control name="city" value={form.city} onChange={change} /></Form.Group>
                    </Col>
                    <Col md={3}>
                      <Form.Group><Form.Label>UF</Form.Label><Form.Control name="uf" maxLength={2} value={form.uf} onChange={change} /></Form.Group>
                    </Col>
                    <Col xs={12}>
                      <Form.Group><Form.Label>Sobre você</Form.Label><Form.Control as="textarea" rows={4} name="about" value={form.about} onChange={change} /></Form.Group>
                    </Col>
                  </Row>
                  <div className="cut-form-actions mt-4">
                    <Button type="button" variant="outline-light" onClick={() => navigate("/dashboard")}>Voltar</Button>
                    <Button type="submit" disabled={loading}>{avatar || background ? "Salvar imagens" : "Salvar agora"}</Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Form>
      </Container>
    </div>
  );
}
