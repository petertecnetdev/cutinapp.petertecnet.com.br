import React, { useContext, useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import authService from "../../services/AuthService";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordValid = useMemo(
    () => /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password) && password.length >= 8,
    [password]
  );
  const canSubmit = firstName.trim().length >= 2 && email.trim() && passwordValid && password === confirmPassword && !loading;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");
    try {
      await authService.register({
        first_name: firstName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      await login(email.trim().toLowerCase(), password);
      navigate("/email-verify", { replace: true });
    } catch (err) {
      setError(err?.message || "Não foi possível criar sua conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="cut-auth-page">
      {loading && <ProcessingIndicatorComponent label="Criando sua conta" />}
      <Container className="cut-auth-container">
        <Row className="justify-content-center w-100">
          <Col xs={12} sm={10} md={8} lg={5} xl={4}>
            <Card className="cut-auth-card">
              <Card.Body>
                <div className="cut-auth-brand">
                  <img src="/images/logo.png" alt="Cutinapp" className="cut-auth-logo" />
                  <div>
                    <span className="cut-auth-kicker">Peter Tecnet</span>
                    <h1>Criar conta</h1>
                    <p>Entre na Cutinapp para retirar cortesias ou produzir eventos.</p>
                  </div>
                </div>

                {error && <Alert variant="danger">{error}</Alert>}

                <Form onSubmit={submit}>
                  <Form.Group className="mb-3">
                    <Form.Label>Seu nome</Form.Label>
                    <Form.Control value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" required />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>E-mail</Form.Label>
                    <Form.Control type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Senha</Form.Label>
                    <Form.Control type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
                    <Form.Text>Use 8+ caracteres, maiúscula, minúscula, número e símbolo.</Form.Text>
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Confirmar senha</Form.Label>
                    <Form.Control type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
                  </Form.Group>
                  {confirmPassword && password !== confirmPassword && <Alert variant="warning">As senhas não coincidem.</Alert>}
                  <Button type="submit" className="w-100" disabled={!canSubmit}>Criar conta</Button>
                </Form>

                <div className="cut-auth-links mt-4">
                  <span>Já possui conta?</span>
                  <Link to="/login">Entrar</Link>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </main>
  );
}
