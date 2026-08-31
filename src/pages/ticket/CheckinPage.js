import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import Webcam from "react-webcam";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";

export default function CheckinPage() {
  const webcamRef = useRef(null);
  const scanningRef = useRef(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [cameraSupported, setCameraSupported] = useState(Boolean(window.BarcodeDetector));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const validate = useCallback(async (rawToken) => {
    const normalized = String(rawToken || "").trim();
    if (!normalized || scanningRef.current) return;

    scanningRef.current = true;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await cutinappService.checkIn(normalized);
      setResult({ type: "success", ...response });
      setToken("");
      setCameraEnabled(false);
    } catch (err) {
      const pass = err?.original?.response?.data?.pass || null;
      setResult({
        type: err?.status === 409 ? "warning" : "danger",
        message: err?.message || "Não foi possível validar esta entrada.",
        pass,
      });
      setCameraEnabled(false);
    } finally {
      setLoading(false);
      window.setTimeout(() => {
        scanningRef.current = false;
      }, 700);
    }
  }, []);

  useEffect(() => {
    if (!cameraEnabled || !cameraSupported || !window.BarcodeDetector) return undefined;

    let cancelled = false;
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      setCameraSupported(false);
      return undefined;
    }

    const scan = async () => {
      if (cancelled || scanningRef.current) return;
      const video = webcamRef.current?.video;
      if (!video || video.readyState < 2 || video.videoWidth < 1) return;

      try {
        const codes = await detector.detect(video);
        const found = codes.find((code) => String(code.rawValue || "").startsWith("CUT-"));
        if (found?.rawValue) await validate(found.rawValue);
      } catch {
        // Alguns navegadores falham em frames isolados; o próximo frame tenta novamente.
      }
    };

    const timer = window.setInterval(scan, 500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cameraEnabled, cameraSupported, validate]);

  const submitManual = (event) => {
    event.preventDefault();
    validate(token);
  };

  const nextParticipant = () => {
    setResult(null);
    setError("");
    setToken("");
    setCameraEnabled(true);
  };

  return (
    <div className="cut-app-page cut-checkin-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Validando entrada" />}

      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div>
            <span className="cut-eyebrow">Portaria</span>
            <h1>Validar QR Code</h1>
            <p>Aponte a câmera para a cortesia. O mesmo QR não pode entrar duas vezes.</p>
          </div>
          <Badge bg="success" className="cut-live-badge">Portaria ativa</Badge>
        </div>

        {error && <Alert variant="danger">{error}</Alert>}

        <Row className="g-4 justify-content-center">
          <Col lg={7}>
            <Card className="cut-panel cut-scanner-card">
              <Card.Body className="p-3 p-md-4">
                {cameraEnabled ? (
                  <div className="cut-scanner">
                    <Webcam
                      ref={webcamRef}
                      audio={false}
                      className="cut-scanner__video"
                      videoConstraints={{ facingMode: { ideal: "environment" } }}
                      onUserMediaError={(mediaError) => {
                        setError(mediaError?.message || "Não foi possível acessar a câmera.");
                        setCameraEnabled(false);
                      }}
                    />
                    <div className="cut-scanner__frame" aria-hidden="true" />
                    <span className="cut-scanner__hint">
                      {cameraSupported ? "Posicione o QR dentro do quadro" : "Leitura automática não suportada neste navegador"}
                    </span>
                  </div>
                ) : result ? (
                  <div className={`cut-checkin-result cut-checkin-result--${result.type}`}>
                    <i className={result.type === "success" ? "fa-solid fa-circle-check" : "fa-solid fa-triangle-exclamation"} />
                    <h2>{result.message}</h2>
                    {result.pass && (
                      <div className="cut-checkin-person">
                        <strong>{result.pass.holder_name || result.pass.holder_email || "Participante"}</strong>
                        <span>{result.pass.event?.title || "Evento"}</span>
                        <span>{result.pass.ticket?.name || "Cortesia"}</span>
                      </div>
                    )}
                    <Button size="lg" onClick={nextParticipant}>Próximo participante</Button>
                  </div>
                ) : (
                  <div className="cut-empty-state-inline">
                    <h2>Câmera pausada</h2>
                    <Button onClick={nextParticipant}>Ativar câmera</Button>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>

          <Col lg={5}>
            <Card className="cut-panel h-100">
              <Card.Body className="p-4">
                <h2 className="cut-section-title">Validação manual</h2>
                <p className="text-secondary">Se a câmera não reconhecer, cole ou digite o código que aparece abaixo do QR do participante.</p>
                <Form onSubmit={submitManual}>
                  <Form.Group>
                    <Form.Label>Código da cortesia</Form.Label>
                    <Form.Control
                      value={token}
                      onChange={(event) => setToken(event.target.value)}
                      placeholder="CUT-..."
                      autoComplete="off"
                    />
                  </Form.Group>
                  <Button className="w-100 mt-3" type="submit" disabled={!token.trim() || loading}>Validar entrada</Button>
                </Form>

                <div className="cut-info-box mt-4">
                  <strong>Segurança</strong>
                  <span>A validação é feita no servidor e registra horário e operador. Uma segunda tentativa com o mesmo QR é bloqueada.</span>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    </div>
  );
}
