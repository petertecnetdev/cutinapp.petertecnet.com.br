import React, { useState, useEffect } from "react";
import { Button, Card, Col, Container, Row, Modal, Alert } from "react-bootstrap";
import { Link } from "react-router-dom";
import profileService from "../../../services/ProfileService";
import NavlogComponent from "../../../components/NavlogComponent";

const ProfileListPage = () => {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);

  const fetchProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await profileService.list();
      setProfiles(response);
    } catch (error) {
      console.error("Erro ao obter a lista de perfis:", error);
      setError("Erro ao obter a lista de perfis. Por favor, tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleDeleteProfile = async (id) => {
    try {
      await profileService.destroy(id);
      fetchProfiles();
      setShowSuccessAlert(true);
      setTimeout(() => setShowSuccessAlert(false), 5000);
    } catch (error) {
      console.error("Erro ao excluir o perfil:", error);
      setShowErrorAlert(true);
      setTimeout(() => setShowErrorAlert(false), 5000);
    }
  };

  const handleCloseModal = () => {
    setShowConfirmModal(false);
    setSelectedProfileId(null);
  };

  const handleShowConfirmModal = (id) => {
    setSelectedProfileId(id);
    setShowConfirmModal(true);
  };

  return (
    <>
      <NavlogComponent />
      <Container>
      <p className="labeltitle h4 text-center ">Profiles</p>
        <Row className="justify-content-md-center mt-5">
          {profiles.map((profile) => (
            <Col md={4} key={profile.id} className="mb-4">
              <Card>
                <Card.Body>
                  <Card.Title>{profile.name}</Card.Title>
                  <Link to={`/profile/update/${profile.id}`}>
                    <Button variant="info" className="m-1">
                      Editar
                    </Button>
                  </Link>
                  <Button variant="danger" className="m-1" onClick={() => handleShowConfirmModal(profile.id)}>
                    Excluir
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          ))}
          {loading && <p>Carregando...</p>}
          {error && <Alert variant="danger" style={{ position: "fixed", top: "10px", right: "10px", zIndex: "1050" }}>{error}</Alert>}
        </Row>
        <Link to="/profile/create">
          <Button
            variant="primary"
            disabled={loading}
            style={{
              position: "fixed",
              bottom: "50px",
              right: "20px",
              zIndex: "1000",
            }}
          >
            {loading ? "Carregando..." : "Adicionar"}
          </Button>
        </Link>
      </Container>

      <Modal show={showConfirmModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>Confirmar Exclusão</Modal.Title>
        </Modal.Header>
        <Modal.Body>Deseja realmente excluir este perfil?</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModal}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => { handleDeleteProfile(selectedProfileId); handleCloseModal(); }}>
            Excluir
          </Button>
        </Modal.Footer>
      </Modal>

      <Alert variant="success" show={showSuccessAlert} onClose={() => setShowSuccessAlert(false)} dismissible style={{ position: "fixed", top: "10px", right: "10px", zIndex: "1050" }}>
        Perfil excluído com sucesso.
      </Alert>

      <Alert variant="danger" show={showErrorAlert} onClose={() => setShowErrorAlert(false)} dismissible style={{ position: "fixed", top: "10px", right: "10px", zIndex: "1050" }}>
        Erro ao excluir o perfil. Por favor, tente novamente.
      </Alert>
    </>
  );
};

export default ProfileListPage;
