import React, { useContext, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loginGoogle } = useContext(AuthContext);
  const googleContainerRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const clientId = String(process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim();
    if (!clientId || !window.google?.accounts?.id || !googleContainerRef.current) return;

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        setLoading(true);
        setError("");
        try {
          await loginGoogle(credential);
          navigate("/dashboard", { replace: true });
        } catch (err) {
          setError(err?.message || "Não foi possível entrar com o Google.");
        } finally {
          setLoading(false);
        }
      },
    });

    googleContainerRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(googleContainerRef.current, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: Math.min(340, window.innerWidth - 64),
      locale: "pt-BR",
    });
  }, [loginGoogle, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setError("");
    try {
      await login(email.trim(), password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setLoading(false);
      setError(err?.message || "Não foi possível entrar.");
      return;
    }
    setLoading(false);
  };

  return (
    <main className="cut-auth-page">
      {loading && <ProcessingIndicatorComponent label="Entrando" />}
      <Container className="cut-auth-container">
        <Row className="justify-content-center w-100">
          <Col xs={12} sm={10} md={8} lg={5} xl={4}>
            <Card className="cut-auth-card">
              <Card.Body>
                <div className="cut-auth-brand">
                  <img src="/images/logo.png" alt="Cutinapp" className="cut-auth-logo" />
                  <div>
                    <span className="cut-auth-kicker">Peter Tecnet</span>
                    <h1>Cutinapp</h1>
                    <p>Acesse sua conta para continuar.</p>
                  </div>
                </div>

                {error && <Alert variant="danger">{error}</Alert>}

                <Form onSubmit={handleSubmit} noValidate>
                  <Form.Group className="mb-3" controlId="login-email">
                    <Form.Label>E-mail</Form.Label>
                    <Form.Control
                      type="email"
                      autoComplete="username"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={loading}
                      required
                    />
                  </Form.Group>

                  <Form.Group className="mb-3" controlId="login-password">
                    <Form.Label>Senha</Form.Label>
                    <Form.Control
                      type="password"
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={loading}
                      required
                    />
                  </Form.Group>

                  <Button type="submit" className="w-100" disabled={loading || !email.trim() || !password}>
                    Entrar
                  </Button>
                </Form>

                <div className="cut-auth-divider"><span>ou</span></div>
                <div ref={googleContainerRef} className="cut-google-slot" />
                {!String(process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim() && (
                  <p className="cut-auth-hint">Login Google disponível quando o Client ID estiver configurado no build.</p>
                )}

                <div className="cut-auth-links">
                  <Link to="/register">Criar conta</Link>
                  <Link to="/password-email">Esqueci minha senha</Link>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </main>
  );
}
