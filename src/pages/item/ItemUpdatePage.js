import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Form, Alert, Card } from 'react-bootstrap';
import itemService from '../../services/ItemService'; 
import { useParams, useNavigate, Link } from 'react-router-dom';
import { storageUrl } from "../../config"; 
import NavlogComponent from "../../components/NavlogComponent";

const ItemUpdatePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageFile, setImageFile] = useState(null);

  useEffect(() => {
    const fetchItem = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await itemService.show(id);
        if (response.error) {
          setError(response.error);
        } else {
          setItem(response.item);
          setSelectedImage(response.item.image ? `${storageUrl}/${response.item.image}` : null);
        }
      } catch (err) {
        setError('Erro ao conectar com o servidor.');
      } finally {
        setLoading(false);
      }
    };

    fetchItem();
  }, [id]);

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
        // Criar FormData e adicionar campos
        const formData = new FormData();
        const formElements = e.target.elements;

        for (let element of formElements) {
            if (element.name && element.value) {
                // Adicionar dados dos campos de formulário, excluindo o tipo "file"
                if (element.type !== 'file') {
                    formData.append(element.name, element.value);
                }
            }
        }

        // Adicionar a imagem se houver
        if (imageFile) {
            formData.append('image', imageFile);
        }

        // Atualizar item
        const response = await itemService.update(id, formData);

        if (response.message) {
            setSuccess(response.message);
            setError(null);
        } else {
            setError('Erro ao atualizar o item.');
            setSuccess(null);
        }
    } catch (err) {
        console.error(err);
        setError('Erro ao atualizar o item.');
        setSuccess(null);
    } finally {
        setLoading(false);
    }
};

  
  const handleDelete = async () => {
    if (item) {
      try {
        const response = await itemService.delete(item.id);
        if (response.success) {
          setSuccess('Item excluído com sucesso!');
          setError(null);
          navigate('/items'); // Redireciona após exclusão
        } else {
          setError(response.message || 'Erro ao deletar o item.');
          setSuccess(null);
        }
      } catch (err) {
        setError('Erro ao deletar o item.');
        setSuccess(null);
      }
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result); // Preview da imagem
      };
      reader.readAsDataURL(file);
    }
  };

  if (loading) return <Alert variant="info">Carregando dados do item...</Alert>;

  return (
    <>
      <NavlogComponent />
      <div
        className="background-image-event"
        style={{
          backgroundImage: `url(${
            item?.event?.image ? `${storageUrl}/${item.event.image}` : "/images/eventflyer.png"
          })`,
        }}
      />
      <Container>
        <div className="text-center mb-4">
          <p className="labeltitle h-7 bg-primary text-center text-uppercase">
            Atualizar Item
          </p>
          {item.event?.title && (
            <Link
              to={`/event/update/${item.event?.id}`}
              style={{
                textDecoration: "none",
                color: "white",
                textTransform: "uppercase",
              }}
            >
              <p className="labeltitle h6 text-center text-uppercase">
                Editar evento 
              </p>
            </Link>
          )}
          <Link
            to={`/event/${item.event?.id}/items`}
            style={{
              textDecoration: "none",
              color: "white",
              textTransform: "uppercase",
            }}
          >
            <p className="labeltitle h6 text-center bg-success text-uppercase">
              Listar itens
            </p>
          </Link>
        </div>
        {error && (
          <Alert
            variant="danger"
            style={{ position: 'fixed', top: 20, left: 0, right: 0, zIndex: 1050 }}
            onClose={() => setError(null)}
            dismissible
          >
            {error}
          </Alert>
        )}
        {success && (
          <Alert
            variant="success"
            style={{ position: 'fixed', top: 80, left: 0, right: 0, zIndex: 1050 }}
            onClose={() => setSuccess(null)}
            dismissible
          >
            {success}
          </Alert>
        )}
        {item && (
          <Row>
            <Col md={4}>
              <Card className="card-event-view">
                <label
                  htmlFor="ImageInput"
                  style={{ cursor: "pointer", display: "block" }}
                >
                  {selectedImage ? (
                    <img
                      src={selectedImage}
                      alt="Preview da Imagem"
                      className="img-event"
                    />
                  ) : (
                    <img
                      src="/images/eventflyer.png"
                      alt="Preview da Imagem"
                      className="img-event"
                    />
                  )}
                </label>
                <Form.Control
                  id="ImageInput"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: "none" }}
                />
              </Card>
            </Col>
            <Col md={8}>
              <Card>
                <Card.Body>
                  <Form onSubmit={handleUpdate}>
                    <Row>
                      <Col md={6}>
                        <Form.Group controlId="formName">
                          <Form.Label>Nome</Form.Label>
                          <Form.Control 
                            type="text" 
                            name="name" 
                            defaultValue={item.name} 
                            required 
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group controlId="formType">
                          <Form.Label>Tipo</Form.Label>
                          <Form.Control 
                            type="text" 
                            name="type" 
                            defaultValue={item.type} 
                            required 
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={6}>
                        <Form.Group controlId="formPrice">
                          <Form.Label>Preço</Form.Label>
                          <Form.Control 
                            type="number" 
                            name="price" 
                            defaultValue={item.price} 
                            step="0.01" 
                            required 
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group controlId="formStock">
                          <Form.Label>Estoque</Form.Label>
                          <Form.Control 
                            type="number" 
                            name="stock" 
                            defaultValue={item.stock} 
                            required 
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={6}>
                        <Form.Group controlId="formCategory">
                          <Form.Label>Categoria</Form.Label>
                          <Form.Control 
                            type="text" 
                            name="category" 
                            defaultValue={item.category} 
                            required 
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group controlId="formAvailabilityStart">
                          <Form.Label>Disponível de</Form.Label>
                          <Form.Control 
                            type="datetime-local" 
                            name="availability_start" 
                            defaultValue={item.availability_start} 
                            required 
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={6}>
                        <Form.Group controlId="formAvailabilityEnd">
                          <Form.Label>Disponível até</Form.Label>
                          <Form.Control 
                            type="datetime-local" 
                            name="availability_end" 
                            defaultValue={item.availability_end} 
                            required 
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group controlId="formStatus">
                          <Form.Check 
                            type="checkbox" 
                            name="status" 
                            label="Ativo" 
                            defaultChecked={item.status} 
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col md={6}>
                        <Form.Group controlId="formLimitedByUser">
                          <Form.Check 
                            type="checkbox" 
                            name="limited_by_user" 
                            label="Limitado por usuário" 
                            defaultChecked={item.limited_by_user} 
                          />
                        </Form.Group>
                      </Col>
                      <Col md={6}>
                        <Form.Group controlId="formIsFeatured">
                          <Form.Check 
                            type="checkbox" 
                            name="is_featured" 
                            label="Destacar Item" 
                            defaultChecked={item.is_featured} 
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                    <Button
                      className="mt-3"
                      variant="primary"
                      type="submit"
                      disabled={loading}
                    >
                      {loading ? "Salvando..." : "Atualizar"}
                    </Button>
                    <Button
                      className="mt-3 ms-2"
                      variant="danger"
                      type="button"
                      onClick={handleDelete}
                    >
                      Excluir
                    </Button>
                  </Form>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}
      </Container>
    </>
  );
};

export default ItemUpdatePage;
