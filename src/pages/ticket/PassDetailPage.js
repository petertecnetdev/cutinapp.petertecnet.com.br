import React, { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Row } from "react-bootstrap";
import { useNavigate, useParams } from "react-router-dom";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value))
  : "Não informado";

export default function PassDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    cutinappService.getPass(id)
      .then((item) => active && setPass(item))
      .catch((err) => active && setError(err?.message || "Não foi possível abrir este ingresso."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id]);

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Abrindo ingresso" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div><span className="cut-eyebrow">Ingresso digital</span><h1>{pass?.event?.title || "Meu ingresso"}</h1><p>Este QR Code é individual e só pode ser validado uma vez na entrada.</p></div>
          <Button variant="outline-light" onClick={() => navigate("/passes")}>Voltar aos ingressos</Button>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {pass && <Row className="justify-content-center g-4">
          <Col lg={7} xl={6}>
            <Card className={`cut-pass-card ${pass.checked_in_at ? "cut-pass-card--used" : ""}`}>
              <Card.Body className="p-4 p-lg-5">
                <div className="cut-pass-card__header">
                  <div><span className="cut-eyebrow">{pass.ticket?.name || "Cortesia"}</span><h2>{pass.event?.title || "Evento"}</h2><p>{formatDate(pass.event?.start_date)}</p></div>
                  <Badge bg={pass.checked_in_at ? "secondary" : "success"}>{pass.checked_in_at ? "Utilizado" : "Válido"}</Badge>
                </div>

                <div className="cut-pass-card__qr"><QrCodeComponent value={pass.token} size={280} /></div>

                <div className="cut-pass-card__meta">
                  <span><strong>Titular:</strong> {pass.holder_name || pass.holder_email}</span>
                  <span><strong>E-mail:</strong> {pass.holder_email || "—"}</span>
                  <span><strong>Local:</strong> {pass.event?.venue || pass.event?.address || "Consulte o evento"}</span>
                  <span><strong>Produção:</strong> {pass.event?.production?.name || "Cutinapp"}</span>
                  {pass.checked_in_at && <span><strong>Entrada validada:</strong> {formatDate(pass.checked_in_at)}</span>}
                </div>

                <details className="cut-token-details"><summary>Código para validação manual</summary><code>{pass.token}</code></details>

                {pass.event?.slug && pass.event?.is_published && !pass.event?.is_cancelled && <Button className="w-100 mt-4" variant="outline-light" onClick={() => navigate(`/event/${pass.event.slug}`)}>Ver página do evento</Button>}
              </Card.Body>
            </Card>
          </Col>
        </Row>}
      </Container>
    </div>
  );
}
