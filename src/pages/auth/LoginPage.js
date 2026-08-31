import React, { useContext, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";

const waitForGoogle = () =>
  new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (window.google?.accounts?.id) {
        window.clearInterval(timer);
        resolve(window.google.accounts.id);
      } else if (attempts >= 50) {
        window.clearInterval(timer);
        reject(new Error("O serviço de login do Google não carregou."));
      }
    }, 100);
  });

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, loginGoogle } = useContext(AuthContext);
  const googleContainerRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [googleStatus, setGoogleStatus] = useState("loading");

  useEffect(() => {
    let active = true;

    const configureGoogle = async () => {
      try {
        const localClientId = String(process.env.REACT_APP_GOOGLE_CLIENT_ID || "").trim();
        const runtimeConfig = localClientId ? {} : await cutinappService.publicConfig();
        const clientId = localClientId || String(runtimeConfig.google_client_id || "").trim();

        if (!clientId) {
          if (active) setGoogleStatus("unavailable");
          return;
        }

        const googleIdentity = await waitForGoogle();
        if (!active || !googleContainerRef.current) return;

        googleIdentity.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            if (!credential) {
              setError("O Google não retornou uma credencial válida.");
              return;
            }

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
        googleIdentity.renderButton(googleContainerRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: Math.min(360, Math.max(240, window.innerWidth - 72)),
          locale: "pt-BR",
        });

        if (active) setGoogleStatus("ready");
      } catch (err) {
        if (active) {
          setGoogleStatus("unavailable");
          setError(err?.message || "Não foi possível carregar o login com Google.");
        }
      }
    };

    configureGoogle();
    return () => {
      active = false;
    };
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
      setError(err?.message || "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
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
                    <p>Eventos, cortesias e acesso em um só lugar.</p>
                  </div>
                </div>

                {error && <Alert variant="danger">{error}</Alert>}

                <Form onSubmit={handleSubmit} noValidate>
                  <Form.Group className="mb-3" controlId="login-email">
                    <Form.Label>E-mail ou usuário</Form.Label>
                    <Form.Control
                      type="text"
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
                {googleStatus === "loading" && (
                  <p className="cut-auth-hint">Carregando acesso com Google...</p>
                )}
                {googleStatus === "unavailable" && (
                  <p className="cut-auth-hint">O acesso com Google está indisponível neste momento.</p>
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
