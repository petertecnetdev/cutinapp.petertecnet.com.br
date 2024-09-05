import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import authService from "../../services/AuthService";
import Navlog from "../../components/NavlogComponent";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Card from "react-bootstrap/Card";
import LoadingComponent from "../../components/LoadingComponent";

const EmailVerifyPage = () => {
  const [verificationCode, setVerificationCode] = useState("");
  const [showAlertState, setShowAlertState] = useState(false);
  const [alertType, setAlertType] = useState("success");
  const [alertMessage, setAlertMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirect, setRedirect] = useState(false);

  const handleVerifyEmail = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const emailVerified = await authService.emailVerify(verificationCode);
      if (emailVerified) {
        window.location.href = "/dashboard";
        setRedirect(true);
      } else {
        showAlert(
          "danger",
          "Erro na verificação de email. Certifique-se de inserir o código corretamente."
        );
      }
    } catch (error) {
      console.error(error);
      showAlert(
        "danger",
        "Erro na verificação de email. Por favor, tente novamente mais tarde."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerificationCode = async () => {
    setLoading(true);
    try {
  
      const codeResent = await authService.resendCodeEmailVerification();
  
      if (codeResent) {
        showAlert("success", "Código de verificação reenviado com sucesso.");
      } else {
        showAlert("danger", "Erro ao reenviar o código de verificação.");
      }
    } catch (error) {
      console.error(error);
      showAlert(
        "danger",
        "Erro ao reenviar o código de verificação. Por favor, tente novamente mais tarde."
      );
    } finally {
      setLoading(false);
    }
  };
  

  const showAlert = (type, message) => {
    setAlertType(type);
    setAlertMessage(message);
    setShowAlertState(true);
  };

  if (redirect) {
    return <Navigate to="/dashboard" />; // Redireciona o usuário para o dashboard após a verificação do e-mail
  }

  return (
    <div className="App">
      <Navlog />
      <Container>
        <Row className="justify-content-center mt-5">
          <Col md={6} className="mt-5">
            <Card>
              <Card.Body>
                <div className="text-center">
                  {" "}
                  {/* Div para centralizar o conteúdo */}
                  <img
                    src="/images/loadingimage.gif"
                    alt="Logo"
                    className="logo rounded-circle img-thumbnail"
                    style={{ width: "150px", height: "150px" }}
                  />
                </div>

                <Card.Title className="text-center">Verificar Email</Card.Title>
                <Form onSubmit={handleVerifyEmail}>
                  <Form.Group className="mb-3">
                    <p>
                      Por favor, digite o código de verificação para confirmar
                      seu email.
                    </p>
                    <Form.Label>Código de Verificação</Form.Label>
                    <Form.Control
                      type="text"
                      placeholder="Insira o código"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      required
                    />
                  </Form.Group>
                  <div className="d-grid">
                    <Button type="submit" variant="primary">
                    {loading ? "Verificando..." : "Verificar email"}
                    </Button>
                  </div>
                </Form>
                <div className="text-center mt-3">
                  <Button
                    variant="secondary"
                    onClick={handleResendVerificationCode}
                    disabled={loading}
                  >
                    
                    {loading ? "Enviando..." : "Reenviar Código de Verificação"}
                  </Button>
                </div>
                
              </Card.Body>
            </Card>
          </Col>
        </Row>
        {showAlertState && (
                  <Alert
                    show={showAlertState}
                    variant={alertType}
                    onClose={() => setShowAlertState(false)}
                    dismissible
                    style={{
                      position: "fixed",
                      bottom: "550px",
                      right: "30px",
                      zIndex: "1000",
                    }}
                  >
                    <Alert.Heading>
                      {alertType === "success" ? "Sucesso" : "Erro"}
                    </Alert.Heading>
                    <p>{alertMessage}</p>
                  </Alert>
                )}
      </Container>
      {loading && <LoadingComponent />}{" "}
      {/* Renderiza o componente de carregamento enquanto verifica o e-mail */}
    </div>
  );
};

export default EmailVerifyPage;
