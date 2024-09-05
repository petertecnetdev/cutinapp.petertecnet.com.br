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
    return Object.values(selectedTickets).reduce(
      (total, qty) => total + qty,
      0
    );
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
            {eventData.event?.segments.map((segment, index) => (
              <p
                key={index}
                className="labeltitle h-7 text-center text-uppercase mt-4"
                style={{ display: "inline-block", margin: "0 10px" }} // Inline-block com margens laterais
              >
                {segment}
              </p>
            ))}
          </Col>
          <Col md={5}>
            <Card className="">
              <Card.Title className="text-uppercase text-center">
                {eventData.event?.title}
              </Card.Title>
              <Card.Body>
                <span className="text-warning ">
                  <p className="text-warning h6 text-center text-uppercase">
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

                <p className=" h6 text-center">
                  <i className="bi h4 bi-geo-alt btn text-white"></i>
                  {eventData.event?.address}
                </p>
                <p className=" h7 p-4 text-center text-uppercase">
                  {eventData.event?.city} - {eventData.event?.uf}
                </p>

                <p className="labeltitle  p-2 h6  text-center ">
                  {" "}
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
              </Card.Body>
            </Card>
          </Col>
        </Row>

        <Row>
          <p className="labeltitle h-7 text-center text-uppercase">Ingressos</p>
          <Col
            md={4}
            className="mb-4 sticky-summary"
            style={{
              backgroundImage: `url(${
                eventData.event?.image
                  ? `${storageUrl}/${eventData.event.image}`
                  : "/images/default-background.png"
              })`,
            }}
          >
            <div className="sticky-summary-content">
              {getTotalTickets() > 0 && (
                <Card className="mb-4 bg-dark">
                  <p className="labeltitle h-7 text-center text-uppercase">
                    Resumo dos ingressos
                  </p>
                  <Card.Body>
                  {eventData.tickets.map((ticket, index) => {
  const qty = selectedTickets[ticket.id] || 0;
  return qty > 0 ? (
    <div key={ticket.id}>
      <Card.Text className="text-center bg-dark rounded p-3">
        <p className="text-primary">{ticket.name}:</p> 
        <span>{qty} x R${ticket.price} = R${(qty * ticket.price).toFixed(2)}</span>
      </Card.Text>
      {index !== eventData.tickets.length - 1 && (
        <hr style={{ border: "1px solid #007bff" }} />
      )}
    </div>
  ) : null;
})}

                    <Card.Text className="text-center font-weight-bold">
                      Total: R${getTotalPrice()},00
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
            <Col md={12}>
              {eventData.tickets?.length > 0 ? (
                eventData.tickets.map((ticket) => (
                  <Card key={ticket.id} className="mb-4">
                    <Card.Body>
                      <Card.Title className="text-center text-uppercase text-primary ">
                        {ticket.name}
                      </Card.Title>
                      <Card.Text className="text-center text-danger h4 text-uppercase">
                        Preço: R${ticket.price}
                      </Card.Text>
                      <Card.Text className="text-center text-secondary">
                        Disponibilidade: {ticket.quantity}
                    
                      </Card.Text>
                      <div className="d-flex justify-content-center align-items-center">
                        <Button
                          variant="outline-secondary"
                          onClick={() => updateQuantity(ticket.id, -1)}
                          disabled={(selectedTickets[ticket.id] || 0) === 0}
                        >
                          -
                        </Button>
                        <span className="mx-3">
                          {selectedTickets[ticket.id] || 0}
                        </span>
                        <Button
                          variant="outline-secondary"
                          onClick={() => updateQuantity(ticket.id, 1)}
                          disabled={
                            (selectedTickets[ticket.id] || 0) >=
                            ticket.available_quantity
                          }
                        >
                          +
                        </Button>
                        
                      </div>
                      <p className="text-primary text-center mt-4">
  {ticket.description}
</p>

                    </Card.Body>
                  </Card>
                ))
              ) : (
                <p className="text-center">Nenhum ingresso disponível.</p>
              )}
            </Col>
            <Col md={12}>
              <p className="labeltitle h-7 bg-primary text-center text-uppercase">
                Descrição
              </p>
              <Card>{eventData.event.description}</Card>
            </Col>
          </Col>
        </Row>

        <Row>
          <p className="labeltitle h-7 text-center text-uppercase">
            Outros eventos
          </p>
          {eventData.events?.map((otherevent) => {
            if (eventData.event?.id !== otherevent.id) {
              return (
                <Col key={otherevent.id} md={4}>
                  <Card className="card-otherevent">
                    {otherevent.image && (
                      <Card.Img
                        variant="top"
                        src={`${storageUrl}/${otherevent.image}`}
                        className="img-otherevent"
                      />
                    )}
                    <Link
                      to={`/event/${otherevent.slug}`}
                      style={{ textDecoration: "none" }}
                    >
                      <p className="labeltitle h-5 text-center text-uppercase">
                        {otherevent.title}
                      </p>
                    </Link>
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
