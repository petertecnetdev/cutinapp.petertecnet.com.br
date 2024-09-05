import React, { useState, useEffect } from "react";
import { Form, Button, Container, Row, Col, Card, Alert } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import itemService from "../../services/ItemService";
import { useLocation, Link } from "react-router-dom";
import LoadingComponent from "../../components/LoadingComponent";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";

const ItemCreatePage = () => {
  const [formData, setFormData] = useState({
    event_id: "",
    name: "",
    type: "",
    description: "",
    imagem:"",
    price: "",
    stock: "",
    status: "",
    limited_by_user: false,
    category: "",
    availability_start: "",
    availability_end: "",
    is_featured: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [validated, setValidated] = useState(false);
  const [imageError, setImageError] = useState(null);
  const [imageFile, setImageFile] = useState(null); 
  const [event, setEvent] = useState(null);

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const eventId = searchParams.get("eventId");

  useEffect(() => {
    if (eventId) {
      setFormData((prev) => ({
        ...prev,
        event_id: eventId,
      }));
    }
  }, [eventId]);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const response = await eventService.show(eventId);
        if (response) {
          setEvent(response);
        } else {
          setError("Não foi possível carregar os dados do evento.");
        }
      } catch (err) {
        setError("Não foi possível carregar os dados do evento.");
      }
    };

    if (eventId) {
      fetchEvent();
    }
  }, [eventId]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : value,
    });
    setValidated(true);
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const allowedTypes = ["image/jpeg", "image/png", "image/jpg"];
      if (!allowedTypes.includes(file.type)) {
        setImageError("Tipo de arquivo não permitido. Aceitos: JPG, JPEG, PNG.");
        return;
      }
      setImageError(null);
      setImageFile(file); // Store file in state

      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.src = reader.result;
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          canvas.width = 350;
          canvas.height = 250;
          ctx.drawImage(img, 0, 0, 350, 250);
          const resizedDataURL = canvas.toDataURL("image/png");
          setImagePreview(resizedDataURL);
        };
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const form = e.currentTarget;
    if (form.checkValidity() === false) {
      e.stopPropagation();
      setValidated(true);
      return;
    }

    try {
      const formDataToSend = new FormData();
      for (const key in formData) {
        if (key === "limited_by_user" || key === "is_featured") {
          formDataToSend.append(key, formData[key] ? "1" : "0");
        } else {
          formDataToSend.append(key, formData[key]);
        }
      }

      if (imageFile) { // Append the image file
        formDataToSend.append("image", imageFile);
      }

      const response = await itemService.store(formDataToSend);
      setSuccessMessage(response.message || "Item criado com sucesso.");
      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Erro ao criar o item. Por favor, tente novamente.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }

    setValidated(true);
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

  if (loading) {
    return <LoadingComponent />;
  }

  return (
    <>
      <NavlogComponent />
      {error && <Alert variant="danger alert-top">{error}</Alert>}
      {successMessage && <Alert variant="success">{successMessage}</Alert>}
      {imageError && <Alert variant="danger">{imageError}</Alert>}
      <Container>
        <div
          className="background-image-event"
          style={{
            backgroundImage: `url(${
              event?.image
                ? `${storageUrl}/${event.image}`
                : "/images/eventflyer.png"
            })`,
          }}
        />
        <Row>
          <p className="labeltitle h7 text-center text-uppercase">Criar item {event?.title}</p>
          {event?.title && (
          <Link
              to={`/event/update/${event?.id}`}
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
            to={`/event/${event?.id}/items`}
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
          <Col md={5} className="mx-auto">
            <Card className="card-item-view">
              <label
                htmlFor="ImageInput"
                style={{ cursor: "pointer", display: "block" }}
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Preview da Imagem"
                    className="img-item"
                  />
                ) : (
                  <img
                    src="/images/itemimage.png"
                    alt="Imagem do Item"
                    className="img-item"
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
          <Col md={7}>
            <Card>
              <Card.Body>
                <Form
                  onSubmit={handleSubmit}
                  className={validated ? "was-validated" : ""}
                >
                  <Row>
                    <Col md={6}>
                      <Form.Group controlId="formName">
                        <Form.Control
                          type="text"
                          name="name"
                          placeholder="Nome do item"
                          value={formData.name}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formType">
                        <Form.Control
                          type="text"
                          name="type"
                          placeholder="Tipo de item"
                          value={formData.type}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group controlId="formDescription">
                        <Form.Control
                          as="textarea"
                          rows={3}
                          name="description"
                          placeholder="Descrição do item"
                          value={formData.description}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formPrice">
                        <Form.Control
                          type="text"
                          name="price"
                          placeholder="Preço"
                          value={formData.price}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formStock">
                        <Form.Control
                          type="number"
                          name="stock"
                          placeholder="Quantidade em estoque"
                          value={formData.stock}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={12}>
                      <Form.Group controlId="formStatus">
                        <Form.Label className="m-2">Status</Form.Label>
                        <Form.Check
                          type="radio"
                          label="Ativo"
                          name="status"
                          value="1"
                          checked={formData.status === "1"}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                        <Form.Check
                          type="radio"
                          label="Inativo"
                          name="status"
                          value="0"
                          checked={formData.status === "0"}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formCategory">
                        <Form.Control
                          type="text"
                          name="category"
                          placeholder="Categoria"
                          value={formData.category}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formLimitedByUser">
                        <Form.Label className="m-2">Limitar por usuário</Form.Label>
                        <Form.Check
                          type="checkbox"
                          name="limited_by_user"
                          checked={formData.limited_by_user}
                          onChange={handleInputChange}
                          className="m-2"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formAvailabilityStart">
                        <Form.Control
                          type="datetime-local"
                          name="availability_start"
                          placeholder="Início da disponibilidade"
                          value={formData.availability_start}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formAvailabilityEnd">
                        <Form.Control
                          type="datetime-local"
                          name="availability_end"
                          placeholder="Fim da disponibilidade"
                          value={formData.availability_end}
                          onChange={handleInputChange}
                          className="m-2"
                          required
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group controlId="formIsFeatured">
                        <Form.Label className="m-2">Item em destaque</Form.Label>
                        <Form.Check
                          type="checkbox"
                          name="is_featured"
                          checked={formData.is_featured}
                          onChange={handleInputChange}
                          className="m-2"
                        />
                      </Form.Group>
                    </Col>
                  </Row>
                  <Button
                    type="submit"
                    variant="primary"
                    className="m-2"
                    style={{ float: "right" }}
                  >
                    Criar Item
                  </Button>
                </Form>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default ItemCreatePage;
