import React, { useState, useEffect } from "react";
import { Button, Card, Col, Container, Row, Modal, Alert, Form } from "react-bootstrap";
import { Link } from "react-router-dom";
import userService from "../../../services/UserService";
import NavlogComponent from "../../../components/NavlogComponent";
import { storageUrl } from "../../../config";

const UserListPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [modalErrorMessage, setModalErrorMessage] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [userFormData, setUserFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    profile_id: ''
  });

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await userService.list();
      setUsers(response.users || []);
      setProfiles(response.profiles || []);
    } catch (error) {
      console.error("Erro ao obter a lista de usuários:", error);
      setError("Erro ao obter a lista de usuários. Por favor, tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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

  const handleDeleteUser = async (id) => {
    try {
      const response = await userService.destroy(id);
      fetchUsers();
      setSuccessMessage(response.message || "Usuário deletado com sucesso.");
    } catch (error) {
      if (error.response && error.response.data && error.response.data.error) {
        setModalErrorMessage(error.response.data.error);
      } else {
        setModalErrorMessage("Não foi possível deletar o usuário.");
      }
      setShowConfirmModal(true);
    }
  };

  const handleConfirmDelete = () => {
    handleDeleteUser(selectedUserId);
    setShowConfirmModal(false);
  };

  const handleCloseModal = () => {
    setShowConfirmModal(false);
    setSelectedUserId(null);
    setModalErrorMessage("");
  };

  const handleEditUser = (user) => {
    setUserFormData({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      profile_id: user.profile_id
    });
    setSelectedUserId(user.id);
    setShowEditModal(true);
  };

  const handleUpdateUser = async () => {
    try {
      const response = await userService.update(selectedUserId, userFormData);
      fetchUsers();
      setShowEditModal(false);
      setSuccessMessage(response.message || "Usuário atualizado com sucesso.");
    } catch (error) {
      console.error("Erro ao atualizar o usuário:", error);
      setError(error.response?.data?.error || "Erro ao atualizar o usuário.");
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setUserFormData({ ...userFormData, [name]: value });
  };

  return (
    <>
      <NavlogComponent />
      <Container>
        <Row className="justify-content-md-center">
          <Col md={12} className="mt-5">
            <h1>Lista de Usuários</h1>
            {loading && <p>Carregando...</p>}
            {error && (
              <Alert
                variant="danger"
                onClose={() => setError(null)}
                dismissible
                style={{
                  position: "fixed",
                  top: "10px",
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
                  top: "10px",
                  right: "10px",
                  zIndex: "1050",
                }}
              >
                {successMessage}
              </Alert>
            )}
            <Row>
              {users.map((user) => (
                <Col key={user.id} md={4} className="mb-4">
                  <Card className="h-100 text-white bg-dark">
                    <Card.Img
                      variant="top"
                      src={
                        user.avatar
                          ? `${storageUrl}/${user.avatar}`
                          : "/images/loadingimage.gif"
                      }
                      alt="User Avatar"
                      style={{
                        borderRadius: "50%",
                        width: "50px",
                        height: "50px",
                        margin: "auto",
                        marginTop: "10px",
                      }}
                    />
                    <Card.Body className="d-flex flex-column">
                      <Card.Title>
                        {user.first_name} {user.last_name}
                      </Card.Title>
                      <Card.Text>{user.email}</Card.Text>
                      <Link to={`/user/${user.user_name}`} className="btn btn-primary mt-auto">
                        Ver Perfil
                      </Link>
                      <Button variant="warning" onClick={() => handleEditUser(user)} className="mt-2">
                        Editar Perfil
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>
              ))}
            </Row>
          </Col>
        </Row>
      </Container>

      <Modal show={showEditModal} onHide={() => setShowEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Editar Usuário</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
          
            <Form.Group controlId="profile_id">
              <Form.Label>Perfil</Form.Label>
              <Form.Control
                as="select"
                name="profile_id"
                value={userFormData.profile_id}
                onChange={handleInputChange}
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </Form.Control>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleUpdateUser}>
            Atualizar
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showConfirmModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>Confirmar Exclusão</Modal.Title>
        </Modal.Header>
        <Modal.Body>{modalErrorMessage}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModal}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleConfirmDelete}>
            Deletar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default UserListPage;
