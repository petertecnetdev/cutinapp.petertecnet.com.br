import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  Col,
  Container,
  Row,
  Modal,
  Alert,
} from "react-bootstrap";
import eventService from "../../../services/EventService";
import NavlogComponent from "../../../components/NavlogComponent";
import { storageUrl } from "../../../config";
import { Link } from "react-router-dom";

const EventListCorpPage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);


  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const eventsData = await eventService.myEvents();
        setEvents(eventsData);
      } catch (error) {
        setError("Erro ao buscar os eventos do usuário.");
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, []);

  const handleDeleteEvent = async (id) => {
    try {
      await eventService.delete(id);
      const updatedEvents = events.filter((event) => event.id !== id);
      setEvents(updatedEvents);
      setShowSuccessAlert(true);
      setTimeout(() => setShowSuccessAlert(false), 5000);
    } catch (error) {
      setShowErrorAlert(true);
      setTimeout(() => setShowErrorAlert(false), 5000);
    }
  };

  const handleCloseModal = () => {
    setShowConfirmModal(false);
    setSelectedEventId(null);
  };

  return (
    <>
      <NavlogComponent />
      <Container>
        <p className="labeltitle h-4 text-center text-uppercase">
          Meus Eventos
        </p>
        {error && <Alert variant="danger">{error}</Alert>}

        <Card>
          <Row>
            {events.length > 0 &&
              events.map((event) => (
                <Col key={event.id} md={3} className="m-1">
                <img
                  src={`${storageUrl}/${event.image}`}
                  alt="Preview da Logo"
                  className="img-fluid rounded"
                />
              
              <Link
            to={`/event/update/${event.id}`}
            style={{
              textDecoration: "none",
              color: "white",
              textTransform: "uppercase",
            }}
          >
            <p className="labeltitle h6 text-center bg-success text-uppercase">
            Editar
            </p>
          </Link>
              
                <Link
                  to={`/event/${event.slug}`}
                  style={{
                    textDecoration: "none",
                    color: "white",
                    textTransform: "uppercase",
                  }}
                >
                  <p className="labeltitle h6 text-center text-uppercase">
                    {event.title}
                  </p>
                </Link>
          
              </Col>
              ))}{" "}
          </Row>
        </Card>

        {loading && <p>Loading...</p>}
      </Container>
      <Modal show={showConfirmModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>Confirmar Exclusão</Modal.Title>
        </Modal.Header>
        <Modal.Body>Tem certeza que deseja excluir este evento?</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModal}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => handleDeleteEvent(selectedEventId)}
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
      >
        Evento excluído com sucesso.
      </Alert>
      <Alert
        variant="danger"
        show={showErrorAlert}
        onClose={() => setShowErrorAlert(false)}
        dismissible
      >
        Erro ao excluir o evento. Por favor, tente novamente.
      </Alert>
    </>
  );
};

export default EventListCorpPage;
