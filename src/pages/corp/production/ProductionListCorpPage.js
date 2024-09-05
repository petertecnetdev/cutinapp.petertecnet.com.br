import React, { useState, useEffect } from "react"; // Adicionando importação dos hooks
import {
  Button,
  Card,
  Col,
  Container,
  Row,
  Modal,
  Alert,
} from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import productionService from "../../../services/ProductionService";
import NavlogComponent from "../../../components/NavlogComponent";
import { storageUrl } from "../../../config";
import authService from "../../../services/AuthService";
import userService from "../../../services/UserService";

const ProductionListCorpPage = () => {
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedProductionId, setSelectedProductionId] = useState(null);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);
  const navigate = useNavigate();

  const fetchProductions = async () => {
    setLoading(true);
    setError(null);
    try {
      const userData = await authService.me();
      console.log(userData.user_name);
      const response = await userService.view(userData.user_name);
      if (response.user && response.user.productions) {
        // Verifica se response.user e response.user.productions não são undefined
        setProductions(response.user.productions);
      } else {
        setError("Nenhuma produção encontrada para este usuário.");
      }
    } catch (error) {
      console.log(error);
      setError("Erro ao buscar as produções do usuário.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProductions();
  }, []);

  const handleDeleteProduction = async (id) => {
    try {
      await productionService.delete(id);
      fetchProductions();
      setShowSuccessAlert(true);
      setTimeout(() => setShowSuccessAlert(false), 5000);
    } catch (error) {
      setShowErrorAlert(true);
      setTimeout(() => setShowErrorAlert(false), 5000);
    }
  };

  const handleCloseModal = () => {
    setShowConfirmModal(false);
    setSelectedProductionId(null);
  };

  const handleShowConfirmModal = (id) => {
    setSelectedProductionId(id);
    setShowConfirmModal(true);
  };

  return (
    <>
      <NavlogComponent />
      <Container>
        <Row>
          <p className="labeltitle h4 text-center text-uppercase">
            Minhas Produções
          </p>
          <Col md={12}>
            <Card>
              <Card.Body>
                <Link to="/production/create">
                  <Button variant="primary">
                    <i className="bi bi-plus-circle  m-2 "></i>
                    Nova Produção
                  </Button>
                </Link>
                <Row>
                  {productions.map((production) => (
                    <Col key={production.id} md={6}>
                      <Card className="card-production-show">
                       <Link
        to={`/production/${production.slug}`}
        style={{ textDecoration: "none" }}
      > <img
      src={`${storageUrl}/${production.logo}`}
      className="rounded-circle img-logo-production-show"
      style={{ margin: '0 auto', display: 'block' }}
    />
    
                    </Link>

                        <Row>
                          <Col md={2}>
                            <Link
                              to={`/production/${production.slug}`}
                              style={{ textDecoration: "none" }}
                            >
                            </Link>
                          </Col>
                          <Col md={12}>
                          <Card.Title className="text-uppercase text-center labeltitle">
                          {production.name}
                        </Card.Title>
                            <Card.Body className="text-center">
                              <Button variant="info" size="sm" className="m-1">
                                <Link
                                  to={`/production/update/${production.id}`}
                                  style={{
                                    textDecoration: "none",
                                    color: "white",
                                  }}
                                >
                                  <i className="bi bi-pencil-square  m-2 "></i>
                                </Link>
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                className="m-1"
                                onClick={() =>
                                  handleShowConfirmModal(production.id)
                                }
                              >
                                <i className="bi bi-trash  m-2 "></i>
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                className="m-1"
                                onClick={() =>
                                  navigate(
                                    `/event/create?productionId=${production.id}`
                                  )
                                }
                              >
                                <i className="bi bi-plus m-2 "></i>
                              </Button>
                            </Card.Body>
                          </Col>
                        </Row>
                      </Card>
                    </Col>
                  ))}
                </Row>
                {loading && <p>Loading...</p>}
                {error && <Alert variant="danger">{error}</Alert>}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      <Modal
        className="text-dark"
        show={showConfirmModal}
        onHide={handleCloseModal}
      >
        <Modal.Header closeButton>
          <Modal.Title>Confirmar exclusão</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Deseja excluir essa produção? Isso será irreversível.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModal}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              handleDeleteProduction(selectedProductionId);
              handleCloseModal();
            }}
          >
            Excluir
          </Button>
        </Modal.Footer>
      </Modal>

      <Alert
        variant="success"
        show={showSuccessAlert}
        onClose={() => setShowSuccessAlert(false)}
        dismissible
        style={{
          position: "fixed",
          top: "10px",
          right: "10px",
          zIndex: "1050",
        }}
      >
        Produção deletada com sucesso
      </Alert>

      <Alert
        variant="danger"
        show={showErrorAlert}
        onClose={() => setShowErrorAlert(false)}
        dismissible
        style={{
          position: "fixed",
          top: "10px",
          right: "10px",
          zIndex: "1050",
        }}
      >
        Não foi possível deletar produção
      </Alert>
    </>
  );
};

export default ProductionListCorpPage;
