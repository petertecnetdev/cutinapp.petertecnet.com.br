import React, { useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  Row,
} from "react-bootstrap";
import authService from "../../services/AuthService";
import { AuthContext } from "../../context/AuthContext";
import Navlog from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";

const EmailVerifyPage = () => {
  const navigate = useNavigate();
  const { refreshUser } = useContext(AuthContext);
  const [verificationCode, setVerificationCode] = useState("");
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);

  const normalizedCode = useMemo(
    () => String(verificationCode || "").trim(),
    [verificationCode]
  );

  const handleVerifyEmail = async (event) => {
    event.preventDefault();
    if (!normalizedCode || loading) return;

    setLoading(true);
    setAlert(null);

    try {
      const response = await authService.emailVerify(normalizedCode);
      const currentUser = await refreshUser();

      if (!currentUser?.email_verified_at) {
        throw new Error(
          "O código foi processado, mas a sessão ainda não recebeu a confirmação do e-mail. Atualize a página e tente novamente."
        );
      }

      setAlert({
        type: "success",
        message: response?.message || "E-mail verificado com sucesso.",
      });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      setAlert({
        type: "danger",
        message:
          error?.message ||
          "Não foi possível validar o código. Confira o código mais recente enviado ao seu e-mail.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerificationCode = async () => {
    if (loading) return;

    setLoading(true);
    setAlert(null);

    try {
      const response = await authService.resendCodeEmailVerification();
      setVerificationCode("");
      setAlert({
        type: "success",
        message:
          response?.message ||
          "Novo código de verificação enviado. Use somente o código mais recente recebido.",
      });
    } catch (error) {
      setAlert({
        type: "danger",
        message:
          error?.message ||
          "Não foi possível reenviar o código de verificação.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <Navlog />
      <Container className="py-5">
        <Row className="justify-content-center">
          <Col xs={12} md={8} lg={6} xl={5}>
            <Card>
              <Card.Body>
                <div className="text-center mb-4">
                  <img
                    src="/images/logo.png"
                    alt="Cutinapp"
                    className="logo rounded-circle"
                    style={{ width: "112px", height: "112px", margin: "0 auto", objectFit: "cover" }}
                  />
                </div>

                <Card.Title className="text-center mb-3">
                  Verificar e-mail
                </Card.Title>
                <p className="text-center mb-4">
                  Digite o código mais recente enviado ao seu e-mail para ativar sua conta.
                </p>

                {alert && (
                  <Alert
                    variant={alert.type}
                    dismissible
                    onClose={() => setAlert(null)}
                  >
                    {alert.message}
                  </Alert>
                )}

                <Form onSubmit={handleVerifyEmail} noValidate>
                  <Form.Group className="mb-3" controlId="verification-code">
                    <Form.Label>Código de verificação</Form.Label>
                    <Form.Control
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Digite o código recebido"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      disabled={loading}
                      required
                    />
                  </Form.Group>

                  <div className="d-grid gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={loading || !normalizedCode}
                    >
                      {loading ? "Verificando..." : "Verificar e-mail"}
                    </Button>

                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleResendVerificationCode}
                      disabled={loading}
                    >
                      Reenviar código
                    </Button>
                  </div>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {loading && (
        <ProcessingIndicatorComponent label="Validando código" />
      )}
    </div>
  );
};

export default EmailVerifyPage;
