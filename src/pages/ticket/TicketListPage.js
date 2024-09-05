import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Col, Row, Alert, Container, Button, Modal } from 'react-bootstrap';
import eventService from '../../services/EventService';
import ticketService from '../../services/TicketService'; // Importar ticketService
import NavlogComponent from "../../components/NavlogComponent";
import { storageUrl } from "../../config";

const TicketListPage = () => {
  const { eventId } = useParams();
  const [tickets, setTickets] = useState([]);
  const [eventData, setEventData] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  useEffect(() => {
    const fetchEventData = async () => {
      try {
        const response = await eventService.view(eventId);
        console.log('Resposta da API:', response);
        if (response && response.data) {
          setEventData(response.data);
          setTickets(response.data.tickets || []);
        } else {
          setError('Não foi possível carregar os dados do evento.');
        }
      } catch (err) {
        console.error('Erro ao carregar dados do evento:', err);
        setError('Não foi possível carregar os dados do evento.');
      }
    };

    fetchEventData();
  }, [eventId]);

  const handleDelete = async () => {
    if (selectedTicket) {
      try {
        const response = await ticketService.delete(selectedTicket.id);
        if (response.success) {
          setTickets(tickets.filter(ticket => ticket.id !== selectedTicket.id));
          setSuccess('Ingresso excluído com sucesso!');
          setError(null);
        } else {
          setError(response.message || 'Erro ao deletar o ingresso.');
          setSuccess(null);
        }
      } catch (err) {
        console.error('Erro ao deletar o ingresso:', err);
        setError('Erro ao deletar o ingresso.');
        setSuccess(null);
      } finally {
        setShowModal(false);
        setSelectedTicket(null);
      }
    }
  };

  const handleShowModal = (ticket) => {
    setSelectedTicket(ticket);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedTicket(null);
  };

  return (
    <>
      <NavlogComponent />
      <Container>
        {/* Alert para mensagens de erro */}
        {error && (
          <Alert variant="danger" style={{ position: 'fixed', top: 20, left: 0, right: 0, zIndex: 1050 }} onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}
        {/* Alert para mensagens de sucesso */}
        {success && (
          <Alert variant="success" style={{ position: 'fixed', top: 80, left: 0, right: 0, zIndex: 1050 }} onClose={() => setSuccess(null)} dismissible>
            {success}
          </Alert>
        )}
        <div className="text-center mb-4">
          <p className="labeltitle h-7 bg-primary text-center text-uppercase">
            Ingressos do evento
          </p>
          {eventData.event?.title && (
            <Link
              to={`/event/update/${eventData.event?.id}`}
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
            to={`/ticket/create?eventId=${eventData.event?.id}`}
            style={{
              textDecoration: "none",
              color: "white",
              textTransform: "uppercase",
            }}
          >
            <p className="labeltitle h6 text-center bg-success text-uppercase">
             Novo ingresso
            </p>
          </Link>
        </div>
        <Row>
        <Card>
                <p className="labeltitle h-7 bg-dark text-center text-uppercase">
                {eventData.event?.title}
          </p> <div
                  style={{
                    position: "absolute",
                    right: "45px",
                    top: "30px",
                    width: "120px",
                    height: "120px",
                    backgroundImage: `url(${
                        eventData.event?.image
                        ? `${storageUrl}/${eventData.event.image}`
                        : "/images/eventflyer.png"
                    })`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    borderRadius: "8px",
                    border: "2px solid white",
                    boxShadow: "0 4px 8px rgba(0, 0, 0, 0.3)",
                  }}
                />
          {tickets && tickets.length > 0 ? (
            tickets.map(ticket => (
              <Col key={ticket.id} md={12} >
            
                 <Card style={{ marginBottom: '1rem', position: 'relative', paddingRight: '150px' }}>
                  {ticket?.event && (
                    <div
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "10px",
                        width: "120px",
                        height: "120px",
                        backgroundImage: `url(${
                          ticket.event?.image
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
                  <Card.Body>
                    <p className="labeltitle h-7 bg-primary text-center text-uppercase">
                      {ticket.name}
                    </p>
                    <Card.Text>
                      <strong>Preço:</strong> {ticket.price}<br />
                      <strong>Tipo:</strong> {ticket.ticket_type}<br />
                      <strong>Quantidade:</strong> {ticket.quantity}<br />
                      <strong>Descrição:</strong> {ticket.description}
                    </Card.Text>

                    <Button
                      className='m-2'
                      variant="warning"
                      onClick={() => window.location.href = `/ticket/update/${ticket.id}`}
                    >
                      <i className="bi bi-pencil m-2"></i>
                    </Button>

                    <Button
                      className='m-2'
                      variant="danger"
                      onClick={() => handleShowModal(ticket)}
                    >
                      <i className="bi bi-trash m-2"></i>
                    </Button>
                  </Card.Body>
                </Card>
               
              </Col>
            ))
          ) : (
            <Col>
              <Card>
                <Card.Body>
                  <Card.Text>Não há ingressos disponíveis para este evento.</Card.Text>
                </Card.Body>
              </Card>
              
            </Col>
          )}
          
          </Card>
        </Row>
        
      </Container>

      <Modal show={showModal} onHide={handleCloseModal}>
        <Modal.Header closeButton>
          <Modal.Title>Confirmar Exclusão</Modal.Title>
        </Modal.Header>
        <Modal.Body>Você tem certeza de que deseja excluir o ingresso &quot;{selectedTicket?.name}&quot;?</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleCloseModal}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Excluir
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default TicketListPage;
