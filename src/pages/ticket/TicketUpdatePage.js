import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, Col, Row, Button, Form, Alert, Container } from "react-bootstrap";
import ticketService from "../../services/TicketService";
import NavlogComponent from "../../components/NavlogComponent";
import { storageUrl } from "../../config";

const TicketUpdatePage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    ticket_type: "",
    quantity: "",
    description: "",
  });

  useEffect(() => {
    const fetchTicket = async () => {
      try {
        const response = await ticketService.show(id);
        console.log("Resposta da API:", response);
        if (response && response.ticket) {
          setTicket(response.ticket);
          setFormData({
            name: response.ticket.name || "",
            price: response.ticket.price || "",
            ticket_type: response.ticket.ticket_type || "",
            quantity: response.ticket.quantity || "",
            description: response.ticket.description || "",
          });
        } else {
          setError("Não foi possível carregar os dados do ingresso.");
        }
      } catch (err) {
        console.error("Erro ao carregar os dados do ingresso:", err);
        setError("Não foi possível carregar os dados do ingresso.");
      }
    };

    fetchTicket();
  }, [id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({ ...prevData, [name]: value }));
  };

  const handleUpdate = async () => {
    try {
      const response = await ticketService.update(id, formData);
      if (response.success) {
        setSuccess("Ingresso atualizado com sucesso.");
        setError(null);
        setTimeout(() => {
          navigate(`/event/${ticket.event_id}/tickets`);
        }, 2000);
      } else {
        setSuccess(null);
        setError(response.message || "Erro ao atualizar ingresso.");
      }
    } catch (err) {
      setSuccess(null);
      setError("Erro ao atualizar ingresso.");
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
            {ticket?.event && (
              <Link
                to={`/event/update/${ticket.event.id}`}
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
 {ticket?.event && (
<Link
to={`/event/${ticket.event.slug}/tickets`}
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
              <Card.Body         >
                {ticket?.event && (
                  <Card.Title>
                    Atualizar Ingresso do evento{" "}
                    <p className="text-danger">{ticket.event.title}</p>
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
              {ticket?.event && (
                <div
                  style={{
                    position: "absolute",
                    right: "45px",
                    top: "30px",
                    width: "120px",
                    height: "120px",
                    backgroundImage: `url(${
                      ticket.event.image
                        ? `${storageUrl}/${ticket.event.image}`
                        : "/images/eventflyer.png"
                    })`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderRadius: "8px",
                    border: "2px solid white",
                    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
                  }}
                />
              )}
                <Button variant="primary"  className="mt-4 btn-lg"onClick={handleUpdate}>
                    Atualizar
                  </Button>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default TicketUpdatePage;
