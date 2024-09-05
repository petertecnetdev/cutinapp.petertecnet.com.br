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
import { Link, useParams } from "react-router-dom";
import profileService from "../../../services/ProfileService";
import permissions from "../../../utils/permissions";
import NavlogComponent from "../../../components/NavlogComponent";

const ProfileUpdatePage = () => {
  const { id } = useParams();
  const [formData, setFormData] = useState({
    name: "",
    selectedPermissions: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiMessage, setApiMessage] = useState(null);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false); // Estado para controlar a exibição do alerta de sucesso
  const [showErrorAlert, setShowErrorAlert] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const profile = await profileService.show(id);
        setFormData({
          name: profile.name,
          selectedPermissions: profile.permissions || [],
        });
      } catch (error) {
        console.error("Erro ao obter perfil:", error);
        setError("Erro ao obter perfil. Por favor, tente novamente.");
      }
    };

    fetchProfile();
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handlePermissionChange = (permissionId) => {
    setFormData((prevFormData) => {
      const isSelected =
        prevFormData.selectedPermissions.includes(permissionId);

      if (isSelected) {
        return {
          ...prevFormData,
          selectedPermissions: prevFormData.selectedPermissions.filter(
            (id) => id !== permissionId
          ),
        };
      } else {
        return {
          ...prevFormData,
          selectedPermissions: [
            ...prevFormData.selectedPermissions,
            permissionId,
          ],
        };
      }
    });
  };

  const handleSelectAllCategory = (categoryPermissions) => {
    const permissionsToAdd = categoryPermissions.map((p) => p.permission);
    setFormData({
      ...formData,
      selectedPermissions: [
        ...formData.selectedPermissions,
        ...permissionsToAdd,
      ],
    });
  };

  const handleClearAllCategory = (categoryPermissions) => {
    const permissionsToRemove = categoryPermissions.map((p) => p.permission);
    setFormData({
      ...formData,
      selectedPermissions: formData.selectedPermissions.filter(
        (id) => !permissionsToRemove.includes(id)
      ),
    });
  };

  const handleSelectAllCategories = () => {
    const allPermissions = Object.values(permissions).map((p) => p.permission);
    setFormData({
      ...formData,
      selectedPermissions: allPermissions,
    });
  };

  const handleClearAllCategories = () => {
    setFormData({
      ...formData,
      selectedPermissions: [],
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (formData.selectedPermissions.length === 0) {
        throw new Error("Nenhuma permissão selecionada");
      }

      const response = await profileService.update(id, {
        name: formData.name,
        permissions: formData.selectedPermissions,
      });
      setApiMessage(response.data.message);
      setShowSuccessAlert(true); // Exibir o alerta de sucesso após a exclusão
      setTimeout(() => setShowSuccessAlert(false), 5000); // Ocultar o alerta após 5 segundos
     
    
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      setError(
        "Erro ao atualizar perfil. Verifique os dados e tente novamente."
      );

      setError("Erro ao criar perfil. Verifique os dados e tente novamente.");
      setShowErrorAlert(true); // Exibir o alerta de erro após a falha na exclusão
      setTimeout(() => setShowErrorAlert(false), 5000); // Ocultar o alerta após 5 segundos
 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiMessage) {
      const timer = setTimeout(() => {
        setApiMessage(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [apiMessage]);

  return (
    <>
      <NavlogComponent />
      <Container>
        <Row className="justify-content-md-center">
          <Col md={12}>
            <Form onSubmit={handleSubmit}>
              <Card className="p-5">
                <h2>Editar Perfil</h2>
                <Col md={4} className="">
                  <Form.Group controlId="formProfileName">
                    <Form.Label>Nome do Perfil</Form.Label>
                    <Form.Control
                      type="text"
                      name="name"
                      placeholder="Digite o nome do perfil"
                      value={formData.name}
                      onChange={handleChange}
                      required
                    />
                  </Form.Group>
                </Col>
                {Object.values(permissions).reduce((acc, permission) => {
                  if (!acc.includes(permission.category)) {
                    acc.push(permission.category);
                    const categoryPermissions = Object.values(
                      permissions
                    ).filter((p) => p.category === permission.category);
                    return [
                      ...acc,
                      <Card key={permission.category} className="mt-3">
                        <Card.Body>
                          <Card.Title>{permission.category}</Card.Title>
                          <div className="text-right mb-3">
                            <Button
                              className="m-2"
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                handleSelectAllCategory(categoryPermissions)
                              }
                            >
                              Selecionar Todos
                            </Button>
                            <Button
                              className="m-2"
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                handleClearAllCategory(categoryPermissions)
                              }
                            >
                              Limpar Seleção
                            </Button>
                          </div>
                          <Form.Group>
                            {categoryPermissions.map((p) => (
                              <Form.Check
                                key={p.permission}
                                type="checkbox"
                                label={`${p.name} - ${p.description}`}
                                onChange={() =>
                                  handlePermissionChange(p.permission)
                                }
                                checked={formData.selectedPermissions.includes(
                                  p.permission
                                )}
                              />
                            ))}
                          </Form.Group>
                        </Card.Body>
                      </Card>,
                    ];
                  }
                  return acc;
                }, [])}                {error && <p className="{text-danger}">{error}</p>}
                </Card>
                <Button
                  variant="primary"
                  type="submit"
                  disabled={loading}
                  style={{
                    position: "fixed",
                    bottom: "50px",
                    right: "20px",
                    zIndex: "1000",
                  }}
                >
                  {loading ? "Carregando..." : "Salvar"}
                </Button>
              </Form>
            </Col>
          </Row>
        </Container>
        
        {/* Botão para listar */}
        <Link to="/profile/list">
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
        {/* Botão para selecionar todos os checkboxes de todas as categorias */}
        <Button
          variant="info"
          onClick={handleSelectAllCategories}
          style={{
            position: "fixed",
            bottom: "150px",
            right: "10px",
            zIndex: "1000",
          }}
        >
          Selecionar Todos
        </Button>
        {/* Botão para limpar a seleção de todas as categorias */}
        <Button
          variant="danger"
          onClick={handleClearAllCategories}
          style={{
            position: "fixed",
            bottom: "100px",
            right: "10px",
            zIndex: "1000",
          }}
        >
          Limpar Seleção
        </Button>
        {/* Alerta para exibir a mensagem da API */}
        {apiMessage && (
          <Alert
            variant="success"
            onClose={() => setApiMessage(null)}
            dismissible
            style={{
              position: "fixed",
              top: "10px",
              right: "10px",
              zIndex: "1000",
            }}
          >
            {apiMessage}
          </Alert>
        )}
         <Alert variant="success" show={showSuccessAlert} onClose={() => setShowSuccessAlert(false)} dismissible style={{ position: "fixed", top: "10px", right: "10px", zIndex: "1050" }}>
       {apiMessage}
      </Alert>
         <Alert variant="danger" show={showErrorAlert} onClose={() => setShowErrorAlert(false)} dismissible style={{ position: "fixed", top: "10px", right: "10px", zIndex: "1050" }}>
         {apiMessage}
      </Alert>
      </>
    );
  };
  
  export default ProfileUpdatePage;
  
