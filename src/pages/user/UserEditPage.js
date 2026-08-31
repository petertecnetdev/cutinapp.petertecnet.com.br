import React, { useContext, useEffect, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
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

export default function UserEditPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useContext(AuthContext);
  const [form, setForm] = useState(emptyForm);
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
      await refreshUser();
      setSuccess(response?.message || "Dados atualizados com sucesso.");
    } catch (err) {
      setError(err?.message || "Não foi possível atualizar sua conta.");
    } finally {
      setLoading(false);
    }
  };

  const initials = String(user?.first_name || "C").slice(0, 2).toUpperCase();

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Salvando sua conta" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Minha conta</span>
            <h1>Dados pessoais</h1>
            <p>Mantenha seus dados corretos para identificação das cortesias e comunicação dos eventos.</p>
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
                    <Button type="button" variant="outline-light" onClick={() => navigate("/dashboard")}>Cancelar</Button>
                    <Button type="submit" disabled={loading}>Salvar alterações</Button>
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
