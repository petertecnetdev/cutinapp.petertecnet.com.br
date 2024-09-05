import React, { useState, useEffect } from "react";
import {
  Form,
  Button,
  Container,
  Row,
  Col,
  Card,
  Alert,
} from "react-bootstrap";
import userService from "../../../services/UserService";
import NavlogComponent from "../../../components/NavlogComponent";
import { Link } from "react-router-dom";

const UserCreatePage = () => {
  const [userData, setUserData] = useState({
    first_name: "",
    email: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData((prevUserData) => ({
      ...prevUserData,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await userService.store(userData);
      setSuccessMessage(response.message);
      setUserData({
        first_name: "",
        email: "",
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let timer;
    if (error || successMessage) {
      timer = setTimeout(() => {
        setError(null);
        setSuccessMessage(null);
      }, 5000);
    }

    return () => clearTimeout(timer);
  }, [error, successMessage]);

  return (
    <>
      <NavlogComponent />
      <Container>
        <Row className="justify-content-md-center">
          <Col md={6}>
            <Form onSubmit={handleSubmit}>
              <Card className="p-5 text-center">
                <h2>Novo Usuário</h2>
                <Col md={12} className="mt-2">
                  <Form.Group controlId="formFirstName">
                    <Form.Control
                      type="text"
                      name="first_name"
                      placeholder="Digite o nome do usuário"
                      value={userData.first_name}
                      onChange={handleChange}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={12} className="mt-2">
                  <Form.Group controlId="formEmail">
                    <Form.Control
                      type="email"
                      name="email"
                      placeholder="Digite o email do usuário"
                      value={userData.email}
                      onChange={handleChange}
                      required
                    />
                  </Form.Group>
                </Col>
                <Col md={12}>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={loading}
                    className="mt-4 btn-lg"
                  >
                    {loading ? "Carregando..." : "Salvar"}
                  </Button>
                </Col>
              </Card>
            </Form>
            <Card className="text-center p-5 mt-4">
              <p className="h3">Cadastro de Novo Usuário</p>
              <p>
                Para cadastrar um novo usuário, preencha os campos de nome e
                e-mail acima e clique no botão &quot;Salvar&quot;. Após o envio
                do formulário, um e-mail de boas-vindas será enviado para o
                endereço de e-mail fornecido. Este e-mail conterá um código de
                verificação e uma senha temporária para o novo usuário. É
                importante que o novo usuário verifique seu e-mail e siga as
                instruções contidas no e-mail para concluir o processo de
                registro.
              </p>
            </Card>
          </Col>
        </Row>
      </Container>
      {error && (
        <Alert
          variant="danger"
          onClose={() => setError(null)}
          dismissible
          style={{
            position: "fixed",
            top: "150px",
            right: "10px",
            zIndex: "1050",
          }}
        >
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert
          variant="success"
          onClose={() => setSuccessMessage(null)}
          dismissible
          style={{
            position: "fixed",
            top: "150px",
            right: "10px",
            zIndex: "1050",
          }}
        >
          {successMessage}
        </Alert>
      )}
       <Link to="/user/list">
          <Button
            variant="secondary"
            disabled={loading}
            style={{
              position: "fixed",
              bottom: "50px",
              right: "100px",
              zIndex: "1000",
            }}
          >
            {loading ? "Carregando..." : "Listar"}
          </Button>
        </Link>
    </>
  );
};

export default UserCreatePage;
