import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import { storageUrl } from "../../config";

const imageUrl = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${storageUrl}${String(path).replace(/^\//, "")}`;
};

export default function ProductionViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [production, setProduction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    cutinappService
      .getProduction(id)
      .then((item) => active && setProduction(item))
      .catch((err) => active && setError(err?.message || "Não foi possível abrir a produção."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  const heroStyle = production?.background
    ? {
        backgroundImage: `linear-gradient(90deg, rgba(2,8,13,.94) 0%, rgba(2,8,13,.7) 48%, rgba(2,8,13,.32) 100%), linear-gradient(180deg, rgba(2,8,13,.08), rgba(2,8,13,.92)), url(${imageUrl(production.background)})`,
      }
    : undefined;

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Abrindo produção" />}

      <Container className="cut-page-container pt-4">
        {location.state?.created && (
          <Alert variant="success">Produção criada e persistida com sucesso. Confira os dados abaixo antes de criar o evento.</Alert>
        )}
        {error && <Alert variant="danger">{error}</Alert>}
      </Container>

      {!loading && production && (
        <>
          <section className="cut-profile-hero" style={heroStyle}>
            <Container className="cut-page-container">
              <div className="cut-profile-hero__content">
                <div className="cut-profile-avatar cut-profile-avatar--square">
                  {production.logo ? (
                    <img src={imageUrl(production.logo)} alt={`Logo de ${production.name}`} />
                  ) : (
                    <span>{String(production.name || "P").slice(0, 2).toUpperCase()}</span>
                  )}
                </div>

                <div>
                  <span className="cut-eyebrow">Produção Cutinapp</span>
                  <h1>{production.name}</h1>
                  <p>{production.description || "Organização responsável pelos eventos."}</p>
                  <div className="cut-social-stats">
                    <span>{production.events_count || 0} eventos</span>
                    {[production.city, production.uf].filter(Boolean).length > 0 && (
                      <span>{[production.city, production.uf].filter(Boolean).join(" / ")}</span>
                    )}
                  </div>
                  <div className="cut-card-actions mt-3">
                    <Button variant="outline-light" onClick={() => navigate("/production/mine")}>Minhas produções</Button>
                    <Button variant="outline-light" onClick={() => navigate(`/production/edit/${production.id}`)}>Editar</Button>
                    <Button onClick={() => navigate(`/event/create?productionId=${production.id}`)}>Criar evento</Button>
                  </div>
                </div>
              </div>
            </Container>
          </section>

          <Container className="cut-page-container py-4 py-lg-5">
            <Row className="g-4">
              <Col lg={4}>
                <Card className="cut-panel h-100"><Card.Body className="p-4">
                  <div className="d-flex align-items-center gap-3 mb-4">
                    {production.logo ? (
                      <img src={imageUrl(production.logo)} alt="" className="cut-production-card__logo" />
                    ) : (
                      <div className="cut-production-card__logo cut-production-card__logo--placeholder">{String(production.name || "P").slice(0, 2).toUpperCase()}</div>
                    )}
                    <div><strong>{production.fantasy || production.name}</strong><div><Badge bg="secondary">{production.events_count || 0} eventos</Badge></div></div>
                  </div>
                  <div className="cut-detail-list">
                    <div><span>Cidade</span><strong>{[production.city, production.uf].filter(Boolean).join(" / ") || "Não informada"}</strong></div>
                    <div><span>Telefone</span><strong>{production.phone || "Não informado"}</strong></div>
                    <div><span>CNPJ</span><strong>{production.cnpj || "Não informado"}</strong></div>
                  </div>
                </Card.Body></Card>
              </Col>
              <Col lg={8}>
                <Card className="cut-panel h-100"><Card.Body className="p-4">
                  <h2 className="cut-section-title">Dados persistidos</h2>
                  <div className="cut-detail-list">
                    <div><span>Endereço</span><strong>{production.address || "Não informado"}</strong></div>
                    <div><span>Site</span><strong>{production.website_url || "Não informado"}</strong></div>
                    <div><span>Instagram</span><strong>{production.instagram_url || "Não informado"}</strong></div>
                  </div>
                  <p className="mt-4 mb-0">Esta tela é carregada novamente pela API usando o ID persistido. Se os dados aparecem aqui, o cadastro já ultrapassou a etapa de formulário e foi recuperado do backend.</p>
                </Card.Body></Card>
              </Col>
            </Row>
          </Container>
        </>
      )}
    </div>
  );
}
