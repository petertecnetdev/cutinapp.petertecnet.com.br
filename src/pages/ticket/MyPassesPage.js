import React, { useEffect, useState } from "react";
import { Alert, Badge, Card, Col, Container, Row } from "react-bootstrap";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import QrCodeComponent from "../../components/QrCodeComponent";
import cutinappService from "../../services/CutinappService";

const formatDate = (value) => {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export default function MyPassesPage() {
  const [passes, setPasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    cutinappService
      .myPasses()
      .then((items) => active && setPasses(items))
      .catch((err) => active && setError(err?.message || "Não foi possível carregar suas cortesias."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="cut-app-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Carregando suas cortesias" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Minha carteira</span>
            <h1>Minhas cortesias</h1>
            <p>Apresente o QR Code na entrada. Cada cortesia só pode ser validada uma vez.</p>
          </div>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        {!loading && passes.length === 0 ? (
          <Card className="cut-empty-state">
            <Card.Body>
              <h2>Você ainda não retirou nenhuma cortesia</h2>
              <p>Abra um evento disponível e retire uma cortesia gratuita.</p>
            </Card.Body>
          </Card>
        ) : (
          <Row className="g-4">
            {passes.map((pass) => (
              <Col xl={6} key={pass.id}>
                <Card className={`cut-pass-card ${pass.checked_in_at ? "cut-pass-card--used" : ""}`}>
                  <Card.Body className="p-4">
                    <div className="cut-pass-card__header">
                      <div>
                        <span className="cut-eyebrow">{pass.ticket?.name || "Cortesia"}</span>
                        <h2>{pass.event?.title || "Evento"}</h2>
                        <p>{formatDate(pass.event?.start_date)}</p>
                      </div>
                      <Badge bg={pass.checked_in_at ? "secondary" : "success"}>
                        {pass.checked_in_at ? "Utilizada" : "Válida"}
                      </Badge>
                    </div>

                    <div className="cut-pass-card__qr">
                      <QrCodeComponent value={pass.token} size={240} />
                    </div>

                    <div className="cut-pass-card__meta">
                      <span><strong>Titular:</strong> {pass.holder_name || pass.holder_email}</span>
                      <span><strong>Local:</strong> {pass.event?.venue || pass.event?.address || "Consulte o evento"}</span>
                      {pass.checked_in_at && (
                        <span><strong>Entrada validada:</strong> {formatDate(pass.checked_in_at)}</span>
                      )}
                    </div>

                    <details className="cut-token-details">
                      <summary>Código manual</summary>
                      <code>{pass.token}</code>
                    </details>
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
