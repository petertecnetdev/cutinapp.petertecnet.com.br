import React, { useState, useEffect } from "react";
import {
  Container,
  Form,
  Button,
  Row,
  Col,
  Card,
  Alert,
} from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import authService from "../../services/AuthService";
import { Link } from "react-router-dom";

const PasswordPage = () => {
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [alertType, setAlertType] = useState("");
  const [formData, setFormData] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  useEffect(() => {
    // Define um temporizador para esconder o alerta após 5 segundos
    const timer = setTimeout(() => {
      setShowAlert(false);
    }, 5000);

    // Limpa o temporizador quando o componente é desmontado ou quando o alerta é fechado manualmente
    return () => clearTimeout(timer);
  }, [showAlert]); // Executa o efeito sempre que showAlert for alterado

  const handleFormSubmit = async (event) => {
    event.preventDefault();
    try {
      // Enviar os dados para a API para alterar a senha
      await authService.changePassword(
        formData.current_password,
        formData.new_password,
        formData.confirm_password
      );

      // Limpar os campos do formulário após a alteração da senha
      setFormData({
        current_password: "",
        new_password: "",
        confirm_password: "",
      });

      // Exibir mensagem de sucesso
      setAlertType("success");
      setAlertMessage("Senha atualizada com sucesso!");
      setShowAlert(true);
    } catch (error) {
      console.error(error);

      // Verificar se a API retornou uma mensagem de erro
      if (error.response && error.response.data && error.response.data.error) {
        // Exibir mensagem de erro da API
        setAlertType("danger");
        setAlertMessage(error.response.data.error);
        setShowAlert(true);
      } else {
        // Exibir mensagem de erro genérica
        setAlertType("danger");
        setAlertMessage("Ocorreu um erro ao atualizar a senha.");
        setShowAlert(true);
      }
    }
  };

  const handleAlertClose = () => {
    setShowAlert(false);
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData({ ...formData, [name]: value });
  };

  return (
    <>
      <NavlogComponent />
      <Container>
        <Row className="justify-content-center mt-5">
          <Col xs={12} md={6} className="mt-5">
            <Card>
              <Card.Body>
                <h2 className="text-center mb-4">Alterar Senha</h2>
                <Form onSubmit={handleFormSubmit}>
                  <Form.Group controlId="current_password" className="mt-4">
                    <Form.Control
                      type="password"
                      placeholder="Digite a senha atual"
                      name="current_password"
                      value={formData.current_password}
                      onChange={handleInputChange}
                      required
                    />
                  </Form.Group>
                  <Form.Group controlId="new_password" className="mt-4">
                    <Form.Control
                      type="password"
                      placeholder="Digite a nova senha"
                      name="new_password"
                      value={formData.new_password}
                      onChange={handleInputChange}
                      required
                    />
                  </Form.Group>
                  <Form.Group controlId="confirm_password" className="mt-4">
                    <Form.Control
                      type="password"
                      name="confirm_password"
                      placeholder="Confirme a senha"
                      value={formData.confirm_password}
                      onChange={handleInputChange}
                      required
                    />
                  </Form.Group>
                  <Button
                    variant="primary"
                    type="submit"
                    className="w-100 mt-4"
                  >
                    Salvar
                  </Button>

                  <Link
                    to="/profile"
                    className="btn bg-info mt-4"
                    style={{ display: "block" }} 
                  >
                    Alterar perfil
                  </Link>
                </Form>
                <Alert
                  show={showAlert}
                  variant={alertType}
                  onClose={handleAlertClose}
                  dismissible
                  className="mt-3"
                >
                  {alertMessage}
                </Alert>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default PasswordPage;
