import React, { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Card, Col, Row, Button, Form, Alert, Container } from "react-bootstrap";
import ticketService from "../../services/TicketService";
import eventService from "../../services/EventService";
import NavlogComponent from "../../components/NavlogComponent";
import { storageUrl } from "../../config";

const TicketCreatePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const eventId = searchParams.get("eventId");

  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    ticket_type: "",
    quantity: "",
    description: "",
    event_id: eventId || "",
  });

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
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleCreate = async () => {
    try {
      const response = await ticketService.store(formData);
      if (response.success) {
        setSuccess("Ingresso criado com sucesso.");
        setError(null);
        setTimeout(() => {
          navigate(`/event/${event?.slug}/tickets`);
        }, 2000);
      } else {
        setSuccess(null);
        setError(response.message || "Erro ao criar ingresso.");
      }
    } catch (err) {
      setSuccess(null);
      setError("Erro ao criar ingresso.");
    }
  };

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [success, error]);

  return (
    <>
      <NavlogComponent />
      <Container>
        {(success || error) && (
          <Alert
            variant={success ? "success" : "danger"}
            style={{
              position: "fixed",
              top: "150px",
              right: "10px",
              zIndex: "1050",
            }}
            onClose={() => {
              setSuccess(null);
              setError(null);
            }}
            dismissible
          >
            {success || error}
          </Alert>
        )}
        <Row>
          <Col>
            {event && (
              <Link
                to={`/event/update/${event.id}`}
                style={{
                  textDecoration: "none",
                  color: "white",
                  textTransform: "uppercase",
                }}
              >
                <p className="labeltitle h6 text-center bg-primary text-uppercase">
                  Editar evento
                </p>
              </Link>
            )}
            {event && (
              <Link
                to={`/event/${event.slug}/tickets`}
                style={{
                  textDecoration: "none",
                  color: "white",
                  textTransform: "uppercase",
                }}
              >
                <p className="labeltitle bg-dark h6 text-center text-uppercase">
                  Ingressos
                </p>
              </Link>
            )}
            <Card style={{ position: "relative" }}>
              <Card.Body>
                {event && (
                  <Card.Title>
                    Criar Ingresso para o evento{" "}
                    <p className="text-danger">{event.title}</p>
                  </Card.Title>
                )}
                <Form>
                  <Form.Group controlId="formName">
                    <Form.Label>Nome</Form.Label>
                    <Form.Control
                      type="text"
                      name="name"
                      value={formData.name || ""}
                      onChange={handleInputChange}
                    />
                  </Form.Group>
                  <Form.Group controlId="formPrice">
                    <Form.Label>Preço</Form.Label>
                    <Form.Control
                      type="number"
                      name="price"
                      value={formData.price || ""}
                      onChange={handleInputChange}
                    />
                  </Form.Group>
                  <Form.Group controlId="formTicketType">
                    <Form.Label>Tipo</Form.Label>
                    <Form.Control
                      type="text"
                      name="ticket_type"
                      value={formData.ticket_type || ""}
                      onChange={handleInputChange}
                    />
                  </Form.Group>
                  <Form.Group controlId="formQuantity">
                    <Form.Label>Quantidade</Form.Label>
                    <Form.Control
                      type="number"
                      name="quantity"
                      value={formData.quantity || ""}
                      onChange={handleInputChange}
                    />
                  </Form.Group>
                  <Form.Group controlId="formDescription">
                    <Form.Label>Descrição</Form.Label>
                    <Form.Control
                      as="textarea"
                      rows={3}
                      name="description"
                      value={formData.description || ""}
                      onChange={handleInputChange}
                    />
                  </Form.Group>
                
                </Form>
              </Card.Body>
              {event && (
                <div
                  style={{
                    position: "absolute",
                    right: "45px",
                    top: "30px",
                    width: "120px",
                    height: "120px",
                    backgroundImage: `url(${
                      event.image
                        ? `${storageUrl}/${event.image}`
                        : "/images/eventflyer.png"
                    })`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderRadius: "8px",
                    border: "2px solid white",
                    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
                  }}
                />
              )}  <Button variant="primary"className="mt-4 btn-lg"  onClick={handleCreate}>
              Salvar
            </Button>
            </Card>
            
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default TicketCreatePage;
