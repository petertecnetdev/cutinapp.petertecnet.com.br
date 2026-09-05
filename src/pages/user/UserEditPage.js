import React, { useContext, useEffect, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import userService from "../../services/UserService";
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

const parseInterests = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) {
    return [];
  }
};

const interestsFromInput = (value) => Array.from(new Set(
  String(value || "")
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 80))
)).slice(0, 50);

export default function UserEditPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useContext(AuthContext);
  const [form, setForm] = useState(emptyForm);
  const [interestsInput, setInterestsInput] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [preview, setPreview] = useState("");
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
    setPreview(user.avatar || "");
  }, [user]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    cutinappService.preferences()
      .then((preferences) => {
        if (!active) return;
        setInterestsInput(parseInterests(preferences?.interests).join(", "));
      })
      .catch(() => {
        // A edição dos dados pessoais continua disponível mesmo se as preferências falharem.
      });
    return () => { active = false; };
  }, [user?.id]);

  const change = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const chooseAvatar = (event) => {
    const file = event.target.files?.[0] || null;
    setAvatar(file);
    if (file) setPreview(URL.createObjectURL(file));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!user?.id || loading) return;

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value ?? ""));
      if (avatar) payload.append("avatar", avatar);

      const response = await userService.update(user.id, payload);
      await cutinappService.savePreferences({ interests: interestsFromInput(interestsInput) });
      await refreshUser();
      setSuccess(response?.message || "Dados e interesses atualizados com sucesso.");
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível atualizar sua conta.");
    } finally {
      setLoading(false);
    }
  };

  const initials = String(user?.first_name || "C").slice(0, 2).toUpperCase();
  const interestPreview = interestsFromInput(interestsInput);

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Salvando sua conta" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Minha conta</span>
            <h1>Perfil e preferências</h1>
            <p>Cuide dos seus dados pessoais e dos interesses que ajudam a Cutinapp a conectar você a eventos e participantes compatíveis.</p>
          </div>
          <Button variant="outline-light" onClick={() => navigate("/password")}>Alterar senha</Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        <Form onSubmit={submit}>
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
                    <Form.Text>PNG, JPG ou WEBP de até 4 MB.</Form.Text>
                  </Form.Group>
                  <div className="text-start mt-4 p-3 rounded border border-secondary border-opacity-25">
                    <small className="text-white-50 d-block mb-2">Privacidade social</small>
                    <strong className="d-block mb-2">O que aparece para outros participantes</strong>
                    <span className="small text-white-50">Nome, avatar, bio, cidade/UF, interesses e eventos públicos em que você marcou “Tenho interesse”. E-mail, telefone, endereço, ingressos e compras não são expostos.</span>
                  </div>
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
                      <Form.Group><Form.Label>Sobre você</Form.Label><Form.Control as="textarea" rows={4} name="about" value={form.about} onChange={change} placeholder="Conte um pouco sobre sua relação com música, festas, cultura e eventos." /></Form.Group>
                    </Col>
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label>Interesses sociais</Form.Label>
                        <Form.Control as="textarea" rows={3} value={interestsInput} onChange={(event) => setInterestsInput(event.target.value)} placeholder="Ex.: samba, pagode, techno, rock, festivais, teatro, gastronomia" />
                        <Form.Text>Separe por vírgula. Esses interesses são usados para calcular afinidade e melhorar a descoberta de pessoas e eventos.</Form.Text>
                      </Form.Group>
                      {interestPreview.length > 0 && <div className="d-flex flex-wrap gap-2 mt-3">{interestPreview.map((interest) => <span key={interest} className="badge rounded-pill text-bg-dark border border-secondary border-opacity-50">{interest}</span>)}</div>}
                    </Col>
                  </Row>
                  <div className="cut-form-actions mt-4">
                    <Button type="button" variant="outline-light" onClick={() => navigate("/profile")}>Cancelar</Button>
                    <Button type="submit" disabled={loading}>Salvar perfil</Button>
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
