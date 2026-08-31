import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const imageUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (String(path).startsWith("images/cutinapp/")) {
    return `https://api.petertecnet.com.br/${String(path).replace(/^\//, "")}`;
  }
  return `${storageUrl}${String(path).replace(/^\//, "")}`;
};

export default function ProductionMinePage() {
  const navigate = useNavigate();
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    cutinappService
      .myProductions()
      .then((items) => active && setProductions(items))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas produções."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Carregando produções" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Área do produtor</span>
            <h1>Minhas produções</h1>
            <p>Organize suas marcas produtoras e crie eventos a partir delas.</p>
          </div>
          <Button onClick={() => navigate("/production/create")}><i className="fa-solid fa-plus me-2" />Nova produção</Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {!loading && productions.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Crie sua primeira produção</h2>
              <p>Você não precisa de liberação administrativa para começar na Cutinapp.</p>
              <Button onClick={() => navigate("/production/create")}>Criar produção</Button>
            </Card.Body>
          </Card>
        ) : (
          <Row className="g-4">
            {productions.map((production) => (
              <Col md={6} xl={4} key={production.id}>
                <Card className="cut-production-card h-100">
                  {production.background && (
                    <div className="cut-production-card__cover" style={{ backgroundImage: `url(${imageUrl(production.background)})` }} />
                  )}
                  <Card.Body className="p-4">
                    <div className="d-flex align-items-center gap-3 mb-3">
                      {production.logo ? (
                        <img src={imageUrl(production.logo)} alt="" className="cut-production-card__logo" />
                      ) : (
                        <div className="cut-production-card__logo cut-production-card__logo--placeholder">{String(production.name || "P").slice(0, 2).toUpperCase()}</div>
                      )}
                      <div>
                        <h2>{production.name}</h2>
                        <Badge bg="secondary">{production.events_count || 0} eventos</Badge>
                      </div>
                    </div>
                    <p>{production.description || "Produção pronta para receber eventos."}</p>
                    <div className="cut-card-actions">
                      <Button onClick={() => navigate(`/event/create?productionId=${production.id}`)}>Criar evento</Button>
                      {production.slug && <Button variant="outline-light" onClick={() => navigate(`/production/${production.slug}`)}>Ver produção</Button>}
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </Container>
    </div>
  );
}
