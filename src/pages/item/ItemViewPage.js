import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, Col, Row, Button, Container, Alert } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import { storageUrl } from "../../config";
import itemService from '../../services/ItemService'; 



const ItemViewPage = () => {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const response = await itemService.show(id);
        if (response && response.item) {
          setItem(response.item);
        } else {
          setError("Não foi possível carregar os dados do item.");
        }
      } catch (err) {
        setError("Erro ao carregar os dados do item.");
      }
    };

    fetchItem();
  }, [id]);

  return (
    <>
      <NavlogComponent />
      <Container>
        {error && (
          <Alert
            variant="danger"
            style={{
              position: "fixed",
              top: "150px",
              right: "10px",
              zIndex: "1050",
            }}
            dismissible
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}
        <Row>
          <Col>
            {item?.event && (
              <Link
                to={`/event/update/${item.event.id}`}
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
            {item?.event && (
              <Link
                to={`/event/${item.event.slug}/items`}
                style={{
                  textDecoration: "none",
                  color: "white",
                  textTransform: "uppercase",
                }}
              >
                <p className="labeltitle bg-dark h6 text-center text-uppercase">
                  Itens
                </p>
              </Link>
            )}
            <Card style={{ position: "relative" }}>
              <Card.Body>
                {item?.event && (
                  <Card.Title>
                    Visualizar Item do evento{" "}
                    <p className="text-danger">{item.event.title}</p>
                  </Card.Title>
                )}
                <p><strong>Nome:</strong> {item?.name}</p>
                <p><strong>Preço:</strong> R${item?.price}</p>
                <p><strong>Tipo:</strong> {item?.item_type}</p>
                <p><strong>Quantidade:</strong> {item?.quantity}</p>
                <p><strong>Descrição:</strong> {item?.description}</p>
              </Card.Body>
              {item?.event && (
                <div
                  style={{
                    position: "absolute",
                    right: "45px",
                    top: "30px",
                    width: "120px",
                    height: "120px",
                    backgroundImage: `url(${
                      item.event.image
                        ? `${storageUrl}/${item.event.image}`
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
              <Link to={`/item/update/${item?.id}`}>
                <Button variant="primary" className="mt-4 btn-lg">
                  Editar
                </Button>
              </Link>
            </Card>
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default ItemViewPage;
