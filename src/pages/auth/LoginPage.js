import React, { Component } from "react";
import authService from "../../services/AuthService";
import Alert from "react-bootstrap/Alert";
import Container from "react-bootstrap/Container";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";

class LoginPage extends Component {
  constructor(props) {
    super(props);
    this.state = {
      email: "",
      senha: "",
      showAlert: false,
      alertType: "success",
      alertMessage: "",
    };
    this.alertTimer = null;
  }

  onChangeEmailUsuario = (e) => {
    this.setState({ email: e.target.value });
  };

  onChangeSenha = (e) => {
    this.setState({ senha: e.target.value });
  };

  onSubmit = async (e) => {
    e.preventDefault();

    try {
      await authService.login(this.state.email, this.state.senha);
    } catch (error) {
      console.error(error);
      this.showAlert("danger", "Erro no login");
    }
  };

  showAlert = (type, message) => {
    this.setState({
      showAlert: true,
      alertType: type,
      alertMessage: message,
    });

    // Define um temporizador para ocultar o alerta após 5 segundos
    this.alertTimer = setTimeout(() => {
      this.setState({ showAlert: false });
    }, 5000);
  };

  // Limpa o temporizador quando o componente é desmontado
  componentWillUnmount() {
    clearTimeout(this.alertTimer);
  }

  render() {
    return (
      <Container>
        <Row className="justify-content-md-center mt-5">
          <Col md={6}>
            <Card>
              <Card.Body>
                <div className="text-center">
                  {/* Div para centralizar o conteúdo */}
                  <img
                    src="/images/logo.png"
                    alt="Logo"
                    className="logo rounded-circle img-thumbnail"
                    style={{ width: "170px", height: "170px" }}
                  />
                </div>
                <Card.Title className="text-center m-4">LOGIN</Card.Title>
                <Card.Text>
                  <Form onSubmit={this.onSubmit}>
                    <Form.Group className="mb-3">
                      <Form.Control
                        type="email"
                        placeholder="Insira o email"
                        onChange={this.onChangeEmailUsuario}
                        value={this.state.email}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Control
                        type="password"
                        placeholder="Insira a senha"
                        onChange={this.onChangeSenha}
                        value={this.state.senha}
                        required
                      />
                    </Form.Group>
                    <Form.Group className="mb-3" controlId="formBasicCheckbox">
                      <Form.Check
                        type="checkbox"
                        label="Lembrar-me"
                        id="customCheck1"
                      />
                    </Form.Group>
                    <button type="submit" className="btn btn-primary">
                      Entrar
                    </button>
                    <p className="forgot-password text-right">
                      Não tem registro? <a href="/register">Registrar</a>
                    </p>
                    <p className="forgot-password text-right">
                      Esqueceu a senha?{" "}
                      <a href="/password-email">Recuperar senha</a>
                    </p>
                  </Form>
                </Card.Text>
              </Card.Body>
            </Card>
            {/* Alert */}
            <Alert
              show={this.state.showAlert}
              variant={this.state.alertType}
              onClose={() => {
                clearTimeout(this.alertTimer);
                this.setState({ showAlert: false });
              }}
              dismissible
              style={{
                position: "fixed",
                top: "150px",
                right: "100px",
                width: "300px",
                zIndex: "1050",
              }}
            >
              {this.state.alertType === "success" ? "Sucesso" : "Erro"}
              <p>{this.state.alertMessage}</p>
            </Alert>
          </Col>
        </Row>
      </Container>
    );
  }
}

export default LoginPage;
