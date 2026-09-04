import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";

const loadJsQr = () => new Promise((resolve, reject) => {
  if (window.jsQR) return resolve(window.jsQR);
  const existing = document.querySelector('script[data-cutinapp-jsqr="1"]');
  if (existing) {
    existing.addEventListener("load", () => resolve(window.jsQR));
    existing.addEventListener("error", () => reject(new Error("Leitor QR alternativo não carregou.")));
    return;
  }
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
  script.async = true;
  script.dataset.cutinappJsqr = "1";
  script.onload = () => window.jsQR ? resolve(window.jsQR) : reject(new Error("Leitor QR alternativo indisponível."));
  script.onerror = () => reject(new Error("Leitor QR alternativo não carregou."));
  document.head.appendChild(script);
});

export default function CheckinPage() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const scanningRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const requestedEventId = new URLSearchParams(location.search).get("eventId") || "";

  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState(requestedEventId);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraNotice, setCameraNotice] = useState("");
  const [readerMode, setReaderMode] = useState(window.BarcodeDetector ? "native" : "fallback");
  const [fallbackReady, setFallbackReady] = useState(Boolean(window.jsQR));
  const [stats, setStats] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const stopCameraStream = useCallback(() => {
    const stream = webcamRef.current?.video?.srcObject;
    if (stream && typeof stream.getTracks === "function") {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const disableCamera = useCallback(() => {
    stopCameraStream();
    setCameraEnabled(false);
  }, [stopCameraStream]);

  const enableCamera = useCallback(() => {
    setCameraNotice("");
    setError("");
    setCameraEnabled(true);
  }, []);

  const refreshStats = useCallback(async (selectedEventId) => {
    if (!selectedEventId) {
      setStats(null);
      return;
    }
    try {
      setStats(await cutinappService.checkInStats(selectedEventId));
    } catch (err) {
      setStats(null);
      setError(err?.message || "Não foi possível carregar os dados da portaria.");
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    eventService.myEvents()
      .then((items) => {
        if (!active) return;
        const available = items.filter((item) => item.is_published && !item.is_cancelled);
        setEvents(available);
        const validRequested = available.some((item) => String(item.id) === String(requestedEventId));
        const initial = validRequested ? String(requestedEventId) : (available.length === 1 ? String(available[0].id) : "");
        setEventId(initial);
        return refreshStats(initial);
      })
      .catch((err) => active && setError(err?.message || "Não foi possível carregar seus eventos publicados."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refreshStats, requestedEventId]);

  useEffect(() => {
    if (readerMode !== "fallback" || fallbackReady) return;
    loadJsQr()
      .then(() => setFallbackReady(true))
      .catch((err) => setError(err?.message || "Seu navegador não conseguiu carregar o leitor QR alternativo."));
  }, [fallbackReady, readerMode]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden" || !cameraEnabled) return;
      disableCamera();
      setCameraNotice("Câmera pausada por segurança quando a Cutinapp saiu de primeiro plano. Ative novamente para continuar a leitura.");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [cameraEnabled, disableCamera]);

  useEffect(() => () => stopCameraStream(), [stopCameraStream]);

  const validate = useCallback(async (rawToken) => {
    const normalized = String(rawToken || "").trim();
    if (!eventId) {
      setError("Selecione o evento antes de validar ingressos.");
      return;
    }
    if (!normalized || scanningRef.current) return;

    scanningRef.current = true;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await cutinappService.checkIn(normalized, eventId);
      setResult({ type: "success", ...response });
      setToken("");
      disableCamera();
      await refreshStats(eventId);
    } catch (err) {
      const pass = err?.original?.response?.data?.pass || null;
      setResult({
        type: err?.status === 409 ? "warning" : "danger",
        message: err?.message || "Não foi possível validar esta entrada.",
        pass,
      });
      disableCamera();
      await refreshStats(eventId);
    } finally {
      setLoading(false);
      window.setTimeout(() => { scanningRef.current = false; }, 700);
    }
  }, [disableCamera, eventId, refreshStats]);

  useEffect(() => {
    if (!cameraEnabled || !eventId) return undefined;

    let cancelled = false;
    let detector = null;
    if (readerMode === "native" && window.BarcodeDetector) {
      try {
        detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        setReaderMode("fallback");
        return undefined;
      }
    }

    const scan = async () => {
      if (cancelled || scanningRef.current || document.visibilityState !== "visible") return;
      const video = webcamRef.current?.video;
      if (!video || video.readyState < 2 || video.videoWidth < 1 || video.videoHeight < 1) return;

      try {
        let rawValue = "";
        if (detector) {
          const codes = await detector.detect(video);
          rawValue = codes.find((code) => String(code.rawValue || "").startsWith("CUT-"))?.rawValue || "";
        } else if (window.jsQR && canvasRef.current) {
          const canvas = canvasRef.current;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
          rawValue = String(code?.data || "");
        }

        if (rawValue.startsWith("CUT-")) await validate(rawValue);
      } catch {
        // Uma falha isolada de frame não encerra a portaria; o próximo frame tenta novamente.
      }
    };

    const timer = window.setInterval(scan, 450);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cameraEnabled, eventId, fallbackReady, readerMode, validate]);

  const selectEvent = async (value) => {
    setEventId(value);
    disableCamera();
    setCameraNotice("");
    setResult(null);
    setToken("");
    setError("");
    await refreshStats(value);
  };

  const nextParticipant = () => {
    setResult(null);
    setError("");
    setToken("");
    enableCamera();
  };

  return (
    <div className="cut-app-page cut-checkin-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Atualizando portaria" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div><span className="cut-eyebrow">Portaria</span><h1>Validar ingressos</h1><p>A portaria fica vinculada a um único evento. Ingressos de outro evento são recusados pelo servidor.</p></div>
          <Badge bg={eventId ? "success" : "secondary"} className="cut-live-badge">{eventId ? "Evento selecionado" : "Selecione um evento"}</Badge>
        </div>

        {error && <Alert variant="danger" role="alert">{error}</Alert>}
        {cameraNotice && <Alert variant="info" role="status" aria-live="polite">{cameraNotice}</Alert>}

        {events.length === 0 && !loading ? (
          <Card className="cut-empty-state"><Card.Body><h2>Nenhum evento publicado para operar</h2><p>Crie a cortesia e publique um evento antes de abrir a portaria.</p><Button onClick={() => navigate("/event/manage")}>Gerenciar eventos</Button></Card.Body></Card>
        ) : <>
          <Card className="cut-panel mb-4"><Card.Body className="p-4"><Row className="g-3 align-items-end"><Col lg={7}><Form.Group><Form.Label>Evento da portaria *</Form.Label><Form.Select value={eventId} onChange={(event) => selectEvent(event.target.value)}><option value="">Selecione o evento</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Form.Select></Form.Group></Col><Col lg={5}><div className="cut-checkin-stats" role="status" aria-live="polite"><span><strong>{stats?.issued ?? 0}</strong> emitidos</span><span><strong>{stats?.checked_in ?? 0}</strong> entradas</span><span><strong>{Math.max(0, Number(stats?.issued || 0) - Number(stats?.checked_in || 0))}</strong> aguardando</span></div></Col></Row></Card.Body></Card>

          <Row className="g-4 justify-content-center">
            <Col lg={7}><Card className="cut-panel cut-scanner-card"><Card.Body className="p-3 p-md-4">
              {!eventId ? <div className="cut-empty-state-inline"><h2>Selecione o evento</h2><p>A câmera só é liberada depois de escolher qual portaria está operando.</p></div> : result ? <div className={`cut-checkin-result cut-checkin-result--${result.type}`} role={result.type === "danger" ? "alert" : "status"} aria-live={result.type === "danger" ? "assertive" : "polite"}><i className={result.type === "success" ? "fa-solid fa-circle-check" : "fa-solid fa-triangle-exclamation"} aria-hidden="true" /><h2>{result.message}</h2>{result.pass && <div className="cut-checkin-person"><strong>{result.pass.holder_name || result.pass.holder_email || "Participante"}</strong><span>{result.pass.event?.title || "Evento"}</span><span>{result.pass.ticket?.name || "Ingresso"}</span></div>}<Button size="lg" onClick={nextParticipant}>Próximo participante</Button></div> : cameraEnabled ? <div className="cut-scanner"><Webcam ref={webcamRef} audio={false} className="cut-scanner__video" screenshotFormat="image/jpeg" videoConstraints={{ facingMode: { ideal: "environment" } }} onUserMediaError={(mediaError) => { setError(mediaError?.message || "Não foi possível acessar a câmera. Verifique a permissão do navegador."); disableCamera(); }} /><canvas ref={canvasRef} hidden /><div className="cut-scanner__frame" aria-hidden="true" /><span className="cut-scanner__hint" role="status" aria-live="polite">{readerMode === "native" ? "Leitor nativo ativo" : fallbackReady ? "Leitor compatível ativo" : "Preparando leitor QR..."} · posicione o QR no quadro</span></div> : <div className="cut-empty-state-inline"><i className="fa-solid fa-camera" aria-hidden="true" /><h2>Câmera pronta para iniciar</h2><p>Toque no botão para solicitar a permissão da câmera deste aparelho.</p><Button size="lg" onClick={enableCamera}>Ativar câmera</Button></div>}
            </Card.Body></Card></Col>

            <Col lg={5}><Card className="cut-panel h-100"><Card.Body className="p-4"><h2 className="cut-section-title">Validação manual</h2><p className="text-secondary">Use o código abaixo do QR apenas se a câmera estiver indisponível.</p><Form onSubmit={(event) => { event.preventDefault(); validate(token); }}><Form.Group><Form.Label>Código do ingresso</Form.Label><Form.Control value={token} onChange={(event) => setToken(event.target.value)} placeholder="CUT-..." autoComplete="off" /></Form.Group><Button className="w-100 mt-3" type="submit" disabled={!eventId || !token.trim() || loading}>Validar entrada</Button></Form><div className="cut-info-box mt-4"><strong>Proteção contra uso indevido</strong><span>O servidor confirma evento, operador, publicação, validade do QR e utilização anterior antes de registrar o check-in.</span></div></Card.Body></Card></Col>
          </Row>
        </>}
      </Container>
    </div>
  );
}
