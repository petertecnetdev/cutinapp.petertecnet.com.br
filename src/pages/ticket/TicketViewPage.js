import React, { useState, useEffect } from "react";
import { Container, Row, Col, Card, Button } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import { useParams, Link } from "react-router-dom";
import eventService from "../../services/EventService";
import LoadingComponent from "../../components/LoadingComponent";
import { storageUrl } from "../../config";

const EventViewPage = () => {
  const { slug } = useParams();
  const [eventData, setEventData] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedTickets, setSelectedTickets] = useState({});

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const response = await eventService.view(slug);
        setEventData(response.data);
        setLoading(false);
      } catch (error) {
        setLoading(false);
      }
    };

    fetchEvent();
  }, [slug]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const options = {
      weekday: "long",
      day: "numeric",
      month: "short",
    };
    return date.toLocaleDateString("pt-BR", options);
  };

  const formatTime = (timeString) => {
    const time = new Date(timeString);
    const options = {
      hour: "numeric",
      minute: "numeric",
    };
    return time.toLocaleTimeString("pt-BR", options);
  };

  const isNextDay = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return start.getDate() !== end.getDate();
  };

  const updateQuantity = (ticketId, change) => {
    setSelectedTickets((prev) => {
      const currentQty = prev[ticketId] || 0;
      const newQty = Math.max(currentQty + change, 0);
      return {
        ...prev,
        [ticketId]: newQty,
      };
    });
  };

  const getTotalTickets = () => {
    return Object.values(selectedTickets).reduce((total, qty) => total + qty, 0);
  };

  const getTotalPrice = () => {
    return eventData.tickets.reduce((total, ticket) => {
      const qty = selectedTickets[ticket.id] || 0;
      return total + ticket.price * qty;
    }, 0);
  };

  if (loading) {
    return <LoadingComponent />;
  }

  return (
    <>
      <NavlogComponent />
      <div
        className="background-image-event"
        style={{
          backgroundImage: `url(${
            eventData.event?.image
              ? `${storageUrl}/${eventData.event.image}`
              : "/images/eventflyer.png"
          })`,
        }}
      />
      <Container>
        <Row>
          <p className="labeltitle h1 text-center text-uppercase p-1">
            {eventData.event?.title}
          </p>
          <Col md={7} className="mt-5">
            <Card.Img
              variant="top"
              src={
                eventData.event?.image
                  ? `${storageUrl}/${eventData.event.image}`
                  : "/images/eventflyer.png"
              }
              alt={`Evento ${eventData.event?.title}`}
              className="rounded"
            />
          </Col>
          <Col md={5}>
            <Card>
              <Card.Title className="text-uppercase text-center">{eventData.event?.title}</Card.Title>
              <Card.Body>
                <span className="text-warning ">
                  <p className="labeltitle h6 text-center text-uppercase">
                    <i className="bi h4 bi-calendar btn text-white"></i>
                    {formatDate(eventData.event?.start_date)} às{" "}
                    <strong>{formatTime(eventData.event?.start_date)}</strong>{" "}
                    até{" "}
                    {isNextDay(
                      eventData.event?.start_date,
                      eventData.event?.end_date
                    )
                      ? `às ${formatTime(eventData.event?.end_date)} `
                      : `às <strong>${formatTime(
                          eventData.event?.end_date
                        )}</strong>`}
                  </p>
                </span>
                <p className="labeltitle p-2 h6 text-light text-center text-danger">
                  <a
                    href={eventData.event?.location}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ cursor: "pointer", textDecoration: "none" }}
                  >
                    <i className="bi h4 bi-house btn text-light"></i>
                    {eventData.event?.establishment_name}
                  </a>{" "}
                </p>
                <p className="labeltitle h6 text-center">
                  <i className="bi h4 bi-geo-alt btn text-white"></i>
                  {eventData.event?.address}
                </p>
                <p className="labeltitle h7 p-4 text-center text-uppercase">
                  {eventData.event?.city} - {eventData.event?.uf}
                </p>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Row>
          <p className="labeltitle h-7 text-center text-uppercase">Ingressos</p>
          <Col md={4} className="mb-4 sticky-summary" style={{
            backgroundImage: `url(${
              eventData.event?.image
                ? `${storageUrl}/${eventData.event.image}`
                : "/images/default-background.png"
            })`
          }}>
            <div className="sticky-summary-content">
              {getTotalTickets() > 0 && (
                <Card className="mb-4">
                  <p className="labeltitle h-7 text-center text-uppercase">Resumo dos ingressos</p>
                  <Card.Body>
                    {eventData.tickets.map((ticket) => {
                      const qty = selectedTickets[ticket.id] || 0;
                      return qty > 0 ? (
                        <Card.Text key={ticket.id} className="text-center">
                          {ticket.name}: {qty} x R${ticket.price} = R${qty * ticket.price}
                        </Card.Text>
                      ) : null;
                    })}
                    <Card.Text className="text-center font-weight-bold">
                      Total: R${getTotalPrice()}
                    </Card.Text>
                    <Link
                      to={`/checkout/${eventData.event?.id}`}
                      className="btn btn-primary text-center"
                      style={{ textDecoration: "none" }}
                    >
                      Finalizar Compra
                    </Link>
                  </Card.Body>
                </Card>
              )}
            </div>
          </Col>

          <Col md={8}>
            {eventData.tickets?.length > 0 ? (
              eventData.tickets.map((ticket) => (
                <Card key={ticket.id} className="mb-4">
                  <Card.Body>
                    <Card.Title className="text-center">
                      {ticket.name}
                    </Card.Title>
                    <Card.Text className="text-center">
                      Preço: R${ticket.price}
                    </Card.Text>
                    <Card.Text className="text-center">
                      Disponibilidade: {ticket.available_quantity}
                    </Card.Text>
                    <div className="d-flex justify-content-center align-items-center">
                      <Button
                        variant="outline-secondary"
                        onClick={() => updateQuantity(ticket.id, -1)}
                        disabled={(selectedTickets[ticket.id] || 0) === 0}
                      >
                        -
                      </Button>
                      <span className="mx-3">{selectedTickets[ticket.id] || 0}</span>
                      <Button
                        variant="outline-secondary"
                        onClick={() => updateQuantity(ticket.id, 1)}
                        disabled={(selectedTickets[ticket.id] || 0) >= ticket.available_quantity}
                      >
                        +
                      </Button>
                    </div>
                  </Card.Body>
                </Card>
              ))
            ) : (
              <p className="text-center">Nenhum ingresso disponível.</p>
            )}
          </Col>
        </Row>

        <Row>
          <p className="labeltitle h-7 text-center text-uppercase">Outros eventos</p>
          {eventData.events?.map((otherevent) => {
            if (eventData.event?.id !== otherevent.id) {
              return (
                <Col key={otherevent.id} md={4}>
                  <Card className="mb-4">
                    <Card.Img
                      variant="top"
                      src={
                        otherevent.image
                          ? `${storageUrl}/${otherevent.image}`
                          : "/images/eventflyer.png"
                      }
                      alt={`Evento ${otherevent.title}`}
                    />
                    <Card.Body>
                      <Card.Title className="text-center">
                        {otherevent.title}
                      </Card.Title>
                      <Card.Text className="text-center">
                        {formatDate(otherevent.start_date)} - {formatTime(otherevent.start_date)}
                      </Card.Text>
                      <Card.Text className="text-center">
                        {otherevent.city} - {otherevent.uf}
                      </Card.Text>
                      <Link
                        to={`/event/${otherevent.slug}`}
                        className="btn btn-primary text-center"
                        style={{ textDecoration: "none" }}
                      >
                        Ver Detalhes
                      </Link>
                    </Card.Body>
                  </Card>
                </Col>
              );
            }
            return null;
          })}
        </Row>
      </Container>
    </>
  );
};

export default EventViewPage;
