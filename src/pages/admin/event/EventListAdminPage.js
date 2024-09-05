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
import { Link } from "react-router-dom";
import eventService from "../../../services/EventService";
import NavlogComponent from "../../../components/NavlogComponent";

const EventListAdminPage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [showSuccessAlert, setShowSuccessAlert] = useState(false);
  const [showErrorAlert, setShowErrorAlert] = useState(false);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const fetchedEvents = await eventService.list();
      setEvents(fetchedEvents);
    } catch (error) {
      console.error("Error fetching events:", error);
      setError("Error fetching events. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleDeleteEvent = async (id) => {
    try {
      const response = await eventService.delete(id);
      console.log(response);
      setMessage(response);
      fetchEvents();
      setShowSuccessAlert(true);
      setTimeout(() => setShowSuccessAlert(false), 5000);
    } catch (error) {
      console.log(error);
      setMessage(error);
      console.error("Error deleting event:", error);
      setShowErrorAlert(true);
      setTimeout(() => setShowErrorAlert(false), 5000);
    }
  };

  const handleCloseModal = () => {
    setShowConfirmModal(false);
    setSelectedEventId(null);
  };

  const handleShowConfirmModal = (id) => {
    setSelectedEventId(id);
    setShowConfirmModal(true);
  };

  return (
    <>
      <NavlogComponent />
      <Container>
        <Row>
          <p className="labeltitle h2 text-center text-uppercase">
            Eventos do sistema
          </p>
          {events.map((event) => (
            <Col key={event.id} md={12}>
              <Card>
                <Link
                  to={`/event/view/${event.slug}`}
                  style={{
                    textDecoration: "none",
                    color: "white",
                    textTransform: "uppercase",
                  }}
                >
                  <Card.Title className="text-center bg-black  rounded-5 p-4">
                    {event.name}
                  </Card.Title>
                </Link>

                <Row>
                  <Col md={4}>
                    <Link
                      to={`/event/${event.slug}`}
                      style={{ textDecoration: "none" }}
                    >
                      <Card.Img
                        variant="top"
                        src={`${event.image}`}
                        className="rounded-circle"
                        style={{ width: "100px", height: "100px" }}
                      />
                    </Link>
                  </Col>
                  <Col md={8}>
                    <strong className="m-2">Local:</strong>
                    <Card.Body>
                      <Button variant="info" size="sm" className="m-1">
                        <Link
                          to={`/event/update/${event.id}`}
                          style={{ textDecoration: "none", color: "white" }}
                        >
                          <i className="bi bi-pencil-square  m-2 "></i>
                        </Link>
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="m-1"
                        onClick={() => handleShowConfirmModal(event.id)}
                      >
                        <i className="bi bi-trash  m-2 "></i>
                      </Button>
                    </Card.Body>
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}

          {loading && <p>Loading...</p>}
          {error && <Alert variant="danger">{error}</Alert>}
        </Row>
        <Link to="/event/create">
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
            {loading ? "Loading..." : "Add"}
          </Button>
        </Link>
      </Container>

      <Modal
        className="text-dark"
        show={showConfirmModal}
        onHide={handleCloseModal}
      >
        <Modal.Header closeButton>
          <Modal.Title>Confirmar exclusão </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Deseja excluir esse evento? Isso será irreversível.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModal}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              handleDeleteEvent(selectedEventId);
              handleCloseModal();
            }}
          >
            Confirmar exclusão
          </Button>
        </Modal.Footer>
      </Modal>

      <Alert
        variant="success"
        show={showSuccessAlert}
        onClose={() => setShowSuccessAlert(false)}
        dismissible
      >
        {message}
      </Alert>

      <Alert
        variant="danger"
        show={showErrorAlert}
        onClose={() => setShowErrorAlert(false)}
        dismissible
      >
        {message}
      </Alert>
    </>
  );
};

export default EventListAdminPage;
