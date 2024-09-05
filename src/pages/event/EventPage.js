import React, { useEffect, useState } from "react";
import { Container, Row, Col, Card, Button, Modal } from "react-bootstrap";
import { Link } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import eventService from "../../services/EventService";
import { storageUrl } from "../../config";

const EventPage = () => {
  const [events, setEvents] = useState([]);
  const [showAllSegments, setShowAllSegments] = useState({});

  const toggleSegments = (eventId) => {
    setShowAllSegments({
      ...showAllSegments,
      [eventId]: !showAllSegments[eventId],
    });
  };

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const fetchedEvents = await eventService.list();
        setEvents(fetchedEvents);
      } catch (error) {
        console.error("Error fetching events:", error);
      }
    };

    fetchEvents();
  }, []);

  return (
    <div>
      <NavlogComponent />
      <Container>
        <Row>
          <p className="labeltitle h2 text-center text-uppercase">Eventos</p>
          {events.map((event) => (
            <Col key={event.id} md={4}>
              <Card className="card-event">
                {event.image && (
                  <Card.Img
                    variant="top"
                    src={`${storageUrl}/${event.image}`}
                    className="img-event"
                  />
                )}
                <Link
                  to={`/event/${event.slug}`}
                  style={{ textDecoration: "none" }}
                >
                  <Card.Body>
                    <Card.Title className="text-uppercase text-center labeltitle">
                      {event.title}
                    </Card.Title>
                  </Card.Body>
                </Link>
                <Card.Text className="text-center">
                  <div className="d-flex flex-wrap justify-content-center">
                    {event.segments.slice(0, 3).map((segment, index) => (
                      <p
                        key={index}
                        className="seguiments text-center text-uppercase"
                      >
                        {segment}
                      </p>
                    ))}
                    {event.segments.length > 3 && (
                      <Button
                        variant="link"
                        onClick={() => toggleSegments(event.id)}
                        style={{ textDecoration: "none" }}
                      >
                        <p className="seguiments text-center">+</p>
                      </Button>
                    )}
                  </div>
                  {/* Modal para mostrar todos os seguimentos */}
                  <Modal
                    show={showAllSegments[event.id]}
                    onHide={() => toggleSegments(event.id)}
                  >
                    <Modal.Header closeButton>
                      <Modal.Title>
                        Seguimentos de {event.title}
                      </Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                      {event.segments.map((segment, index) => (
                        <p
                          key={index}
                          className="seguiments text-center text-uppercase"
                        >
                          {segment}
                        </p>
                      ))}
                    </Modal.Body>
                  </Modal>
                </Card.Text>
              </Card>
            </Col>
          ))}
        </Row>
      </Container>
    </div>
  );
};

export default EventPage;
