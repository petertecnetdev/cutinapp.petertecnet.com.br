import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Alert, Modal } from 'react-bootstrap';
import itemService from '../../services/ItemService'; 
import { useParams, Link } from 'react-router-dom';
import { storageUrl } from "../../config"; 
import NavlogComponent from "../../components/NavlogComponent";

const ItemListPage = () => {
  const { eventId } = useParams();
  const [items, setItems] = useState([]);
  const [event, setEvent] = useState(null); // Novo estado para armazenar os dados do evento
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    const fetchItems = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await itemService.listByEvent(eventId);
        if (response.error) {
          setError(response.error);
        } else {
          setItems(response.items);
          setEvent(response.event); // Armazena os dados do evento
        }
      } catch (err) {
        setError('Erro ao conectar com o servidor.');
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [eventId]);

  const handleDelete = async () => {
    if (selectedItem) {
      try {
        const response = await itemService.delete(selectedItem.id);
        if (response.success) {
          setItems(items.filter(item => item.id !== selectedItem.id));
          setSuccess('Item excluído com sucesso!');
          setError(null);
        } else {
          setError(response.message || 'Erro ao deletar o item.');
          setSuccess(null);
        }
      } catch (err) {
        setError('Erro ao deletar o item.');
        setSuccess(null);
      } finally {
        setShowModal(false);
        setSelectedItem(null);
      }
    }
  };

  const handleShowModal = (item) => {
    setSelectedItem(item);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedItem(null);
  };

  return (
    <>
      <NavlogComponent />
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
      <Container>
        
      <div className="text-center mb-4">
          <p className="labeltitle h-7 bg-primary text-center text-uppercase">
            Itens do evento
          </p>
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
            to={`/item/create?eventId=${event?.id}`}
            style={{
              textDecoration: "none",
              color: "white",
              textTransform: "uppercase",
            }}
          >
            <p className="labeltitle h6 text-center bg-success text-uppercase">
             Novo item
            </p>
          </Link>
        </div>
        {loading && <Alert variant="info">Carregando itens...</Alert>}
        {error && (
          <Alert variant="danger" style={{ position: 'fixed', top: 20, left: 0, right: 0, zIndex: 1050 }} onClose={() => setError(null)} dismissible>
            {error}
          </Alert>
        )}
        {success && (
          <Alert variant="success" style={{ position: 'fixed', top: 80, left: 0, right: 0, zIndex: 1050 }} onClose={() => setSuccess(null)} dismissible>
            {success}
          </Alert>
        )}
        <Row>
          {items.length > 0 ? (
            items.map(item => (
              <Col key={item.id} md={12}>
                <Card className="mb-4">
                  <Row>
                  <Col md={4}>
                  <Card.Img 
                    variant="top" 
                    src={item.image ? `${storageUrl}/${item.image}` : "/images/itemimage.png"} // Usa imagem genérica se não houver imagem associada
                  />
                  </Col>
                  <Col md={8}>
                  <Card.Body>
                    <Card.Title>{item.name}</Card.Title>
                    <Card.Text>
                      Tipo: {item.type}<br />
                      Preço: {typeof item.price === 'number' ? `R$${item.price.toFixed(2)}` : 'Não disponível'}<br />
                      Estoque: {item.stock}<br />
                      Categoria: {item.category}<br />
                      Disponível de: {new Date(item.availability_start).toLocaleDateString()} até {new Date(item.availability_end).toLocaleDateString()}
                    </Card.Text>
                    <Button
                      className='m-2'
                      variant="warning"
                      as={Link}
                      to={`/item/update/${item.id}`}
                    >
                      <i className="bi bi-pencil m-2"></i> 
                    </Button>
                    <Button
                      className='m-2'
                      variant="danger"
                      onClick={() => handleShowModal(item)}
                    >
                      <i className="bi bi-trash m-2"></i> 
                    </Button>
                  </Card.Body>
                  </Col>
                  </Row>
                </Card>
              </Col>
            ))
          ) : (
            <Col>
              <Card>
                <Card.Body>
                  <Card.Text>Não há itens disponíveis para este evento.</Card.Text>
                </Card.Body>
              </Card>
            </Col>
          )}
        </Row>

        <Modal show={showModal} onHide={handleCloseModal}>
          <Modal.Header closeButton>
            <Modal.Title>Confirmar Exclusão</Modal.Title>
          </Modal.Header>
          <Modal.Body>Você tem certeza de que deseja excluir o item &quot;{selectedItem?.name}&quot;?</Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Excluir
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </>
  );
};

export default ItemListPage;
