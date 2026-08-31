import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Data não informada";

export default function MyPassesPage() {
  const navigate = useNavigate();
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    cutinappService.myPasses()
      .then((items) => active && setPasses(items))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus ingressos."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Carregando seus ingressos" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div><span className="cut-eyebrow">Minha carteira</span><h1>Meus ingressos</h1><p>Seus ingressos Cutinapp ficam disponíveis aqui, inclusive depois de atualizar a página ou entrar novamente.</p></div>
          <Button variant="outline-light" onClick={() => navigate("/event")}>Encontrar eventos</Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {!loading && passes.length === 0 ? (
          <Card className="cut-empty-state"><Card.Body><h2>Nenhum ingresso por aqui ainda</h2><p>Abra um evento publicado e retire uma cortesia gratuita.</p><Button onClick={() => navigate("/event")}>Ver eventos</Button></Card.Body></Card>
        ) : (
          <Row className="g-4">
            {passes.map((pass) => <Col xl={6} key={pass.id}>
              <Card className={`cut-pass-card ${pass.checked_in_at ? "cut-pass-card--used" : ""}`}>
                <Card.Body className="p-4">
                  <div className="cut-pass-card__header">
                    <div><span className="cut-eyebrow">{pass.ticket?.name || "Cortesia"}</span><h2>{pass.event?.title || "Evento"}</h2><p>{formatDate(pass.event?.start_date)}</p></div>
                    <Badge bg={pass.checked_in_at ? "secondary" : "success"}>{pass.checked_in_at ? "Utilizado" : "Válido"}</Badge>
                  </div>
                  <div className="cut-pass-card__qr"><QrCodeComponent value={pass.token} size={220} /></div>
                  <div className="cut-pass-card__meta">
                    <span><strong>Titular:</strong> {pass.holder_name || pass.holder_email}</span>
                    <span><strong>Local:</strong> {pass.event?.venue || pass.event?.address || "Consulte o evento"}</span>
                    {pass.checked_in_at && <span><strong>Entrada validada:</strong> {formatDate(pass.checked_in_at)}</span>}
                  </div>
                  <div className="cut-card-actions mt-4"><Button onClick={() => navigate(`/passes/${pass.id}`)}>Abrir ingresso</Button>{pass.event?.slug && pass.event?.is_published && !pass.event?.is_cancelled && <Button variant="outline-light" onClick={() => navigate(`/event/${pass.event.slug}`)}>Ver evento</Button>}</div>
                </Card.Body>
              </Card>
            </Col>)}
          </Row>
        )}
      </Container>
    </div>
  );
}
