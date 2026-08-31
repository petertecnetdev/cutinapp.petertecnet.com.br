import React, { useMemo, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import authService from "../../services/AuthService";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";

export default function PasswordEmailPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const passwordValid = useMemo(
    () => /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password) && password.length >= 8,
    [password]
  );

  const requestCode = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await authService.passwordEmail(email.trim().toLowerCase());
      setMessage(response?.message || "Se o e-mail estiver cadastrado, um código foi enviado.");
      setStep("reset");
    } catch (err) {
      setError(err?.message || "Não foi possível solicitar a recuperação de senha.");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event) => {
    event.preventDefault();
    if (!passwordValid || password !== confirmPassword) return;

    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await authService.passwordReset(
        email.trim().toLowerCase(),
        code,
        password,
        confirmPassword
      );
      setMessage(response?.message || "Senha redefinida com sucesso.");
      window.setTimeout(() => navigate("/login", { replace: true }), 900);
    } catch (err) {
      setError(err?.message || "Não foi possível redefinir sua senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="cut-auth-page">
      {loading && <ProcessingIndicatorComponent label={step === "email" ? "Enviando código" : "Redefinindo senha"} />}
      <Container className="cut-auth-container">
        <Row className="justify-content-center w-100">
          <Col xs={12} sm={10} md={8} lg={5} xl={4}>
            <Card className="cut-auth-card">
              <Card.Body>
                <div className="cut-auth-brand">
                  <img src="/images/logo.png" alt="Cutinapp" className="cut-auth-logo" />
                  <div>
                    <span className="cut-auth-kicker">Acesso</span>
                    <h1>Recuperar senha</h1>
                    <p>{step === "email" ? "Receba um código por e-mail." : "Digite o código recebido e escolha uma nova senha."}</p>
                  </div>
                </div>

                {error && <Alert variant="danger">{error}</Alert>}
                {message && <Alert variant="success">{message}</Alert>}

                {step === "email" ? (
                  <Form onSubmit={requestCode}>
                    <Form.Group className="mb-3">
                      <Form.Label>E-mail</Form.Label>
                      <Form.Control
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </Form.Group>
                    <Button type="submit" className="w-100" disabled={!email.trim() || loading}>Enviar código</Button>
                  </Form>
                ) : (
                  <Form onSubmit={resetPassword}>
                    <Form.Group className="mb-3">
                      <Form.Label>Código recebido</Form.Label>
                      <Form.Control value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" required />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Nova senha</Form.Label>
                      <Form.Control type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
                      <Form.Text>8+ caracteres, maiúscula, minúscula, número e símbolo.</Form.Text>
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Confirmar nova senha</Form.Label>
                      <Form.Control type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required />
                    </Form.Group>
                    {confirmPassword && password !== confirmPassword && <Alert variant="warning">As senhas não coincidem.</Alert>}
                    <Button type="submit" className="w-100" disabled={!code.trim() || !passwordValid || password !== confirmPassword || loading}>Salvar nova senha</Button>
                    <Button type="button" variant="link" className="w-100 mt-2" onClick={() => setStep("email")}>Solicitar outro código</Button>
                  </Form>
                )}

                <div className="cut-auth-links mt-4">
                  <Link to="/login">Voltar ao login</Link>
                  <Link to="/register">Criar conta</Link>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </main>
  );
}
