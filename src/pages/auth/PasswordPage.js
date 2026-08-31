import React, { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import authService from "../../services/AuthService";

export default function PasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const passwordValid = useMemo(
    () => /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword) && /\d/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword) && newPassword.length >= 8,
    [newPassword]
  );
  const canSubmit = currentPassword && passwordValid && newPassword === confirmPassword && !loading;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await authService.changePassword(currentPassword, newPassword, confirmPassword);
      setSuccess(response?.message || "Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err?.message || "Não foi possível alterar sua senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Alterando senha" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <Row className="justify-content-center">
          <Col lg={7} xl={6}>
            <div className="cut-page-heading">
              <div>
                <span className="cut-eyebrow">Segurança</span>
                <h1>Alterar senha</h1>
                <p>Use uma senha forte e diferente da atual.</p>
              </div>
            </div>
            {error && <Alert variant="danger">{error}</Alert>}
            {success && <Alert variant="success">{success}</Alert>}
            <Card className="cut-panel">
              <Card.Body className="p-4 p-lg-5">
                <Form onSubmit={submit}>
                  <Form.Group className="mb-3">
                    <Form.Label>Senha atual</Form.Label>
                    <Form.Control type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Nova senha</Form.Label>
                    <Form.Control type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required />
                    <Form.Text>8+ caracteres, maiúscula, minúscula, número e símbolo.</Form.Text>
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Confirmar nova senha</Form.Label>
                    <Form.Control type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
                  </Form.Group>
                  {confirmPassword && newPassword !== confirmPassword && <Alert variant="warning">As senhas não coincidem.</Alert>}
                  <div className="cut-form-actions">
                    <Button type="button" variant="outline-light" onClick={() => navigate("/user/edit")}>Voltar</Button>
                    <Button type="submit" disabled={!canSubmit}>Salvar nova senha</Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
