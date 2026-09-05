import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import { getNetworkStatus, isNetworkFailure, subscribeToNetworkStatus } from "../../utils/networkStatus";

const JSQR_URL = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
const JSQR_INTEGRITY = "sha256-vEDIoVGWI2sjFNsIVvcsoLSZgM1UE7jIUqc0n1/uCFk=";
const JSQR_LOAD_TIMEOUT_MS = 8000;

const tokenKind = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized.startsWith("ITEM-")) return "item";
  if (normalized.startsWith("CUT-") || normalized.startsWith("PASS-")) return "ticket";
  return null;
};

const loadJsQr = () => new Promise((resolve, reject) => {
  if (window.jsQR) return resolve(window.jsQR);

  const existing = document.querySelector('script[data-cutinapp-jsqr="1"]');
  const script = existing || document.createElement("script");
  let settled = false;

  const cleanup = () => {
    window.clearTimeout(timeoutId);
    script.removeEventListener("load", handleLoad);
    script.removeEventListener("error", handleError);
  };

  const finish = (callback) => {
    if (settled) return;
    settled = true;
    cleanup();
    callback();
  };

  const handleLoad = () => finish(() => {
    if (window.jsQR) resolve(window.jsQR);
    else reject(new Error("Leitor QR alternativo indisponível."));
  });

  const handleError = () => finish(() => reject(new Error("Leitor QR alternativo não carregou.")));

  const timeoutId = window.setTimeout(() => {
    finish(() => reject(new Error("O leitor QR alternativo demorou demais para carregar. Verifique a conexão e tente novamente.")));
  }, JSQR_LOAD_TIMEOUT_MS);

  script.addEventListener("load", handleLoad);
  script.addEventListener("error", handleError);

  if (!existing) {
    script.src = JSQR_URL;
    script.async = true;
    script.integrity = JSQR_INTEGRITY;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.dataset.cutinappJsqr = "1";
    document.head.appendChild(script);
  }
});

export default function CheckinPage() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const scanningRef = useRef(false);
  const decodingRef = useRef(false);
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
  const [networkStatus, setNetworkStatus] = useState(() => getNetworkStatus());

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

  useEffect(() => subscribeToNetworkStatus((status) => {
    setNetworkStatus(status);
    if (status === "offline" && cameraEnabled) {
      disableCamera();
      setCameraNotice("Sem conexão com a internet. A câmera foi pausada para evitar uma validação com resultado incerto.");
    } else if (status === "online") {
      setCameraNotice((notice) => notice.startsWith("Sem conexão")
        ? "Conexão restabelecida. Você já pode reativar a câmera e continuar a operação."
        : notice);
    }
  }), [cameraEnabled, disableCamera]);

  useEffect(() => () => stopCameraStream(), [stopCameraStream]);

  const validate = useCallback(async (rawToken) => {
    const normalized = String(rawToken || "").trim();
    const kind = tokenKind(normalized);
    if (!eventId) {
      setError("Selecione o evento antes de validar o QR Code.");
      return;
    }
    if (!normalized || scanningRef.current) return;
    if (!kind) {
      setResult({ type: "danger", kind: null, message: "QR Code não reconhecido pela Cutinapp." });
      return;
    }
    if (getNetworkStatus() === "offline") {
      setError("");
      setResult({
        type: "warning",
        kind,
        message: "Sem conexão com a internet. Reconecte antes de validar este QR Code.",
        pass: null,
      });
      disableCamera();
      return;
    }

    scanningRef.current = true;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = kind === "item"
        ? await commerceService.redeemEventItems(normalized, eventId)
        : await cutinappService.checkIn(normalized, eventId);
      setResult({ type: "success", kind, ...response });
      setToken("");
      disableCamera();
      await refreshStats(eventId);
    } catch (err) {
      const networkFailure = isNetworkFailure(err);
      const pass = kind === "ticket" ? err?.original?.response?.data?.pass || null : null;
      setResult({
        type: networkFailure || err?.status === 409 ? "warning" : "danger",
        kind,
        message: networkFailure
          ? "A conexão caiu durante a validação. O servidor pode ter registrado a operação. Reconecte e valide o mesmo QR novamente; a Cutinapp impedirá uma segunda utilização."
          : err?.message || (kind === "item" ? "Não foi possível confirmar a retirada." : "Não foi possível validar esta entrada."),
        pass,
      });
      disableCamera();
      if (!networkFailure) await refreshStats(eventId);
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
      if (cancelled || scanningRef.current || decodingRef.current || document.visibilityState !== "visible") return;
      const video = webcamRef.current?.video;
      if (!video || video.readyState < 2 || video.videoWidth < 1 || video.videoHeight < 1) return;

      decodingRef.current = true;
      try {
        let rawValue = "";
        if (detector) {
          const codes = await detector.detect(video);
          rawValue = codes.find((code) => tokenKind(code.rawValue))?.rawValue || "";
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

        if (tokenKind(rawValue)) await validate(rawValue);
      } catch {
        // Uma falha isolada de frame não encerra a operação; o próximo frame tenta novamente.
      } finally {
        decodingRef.current = false;
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
    if (networkStatus === "offline") {
      setCameraNotice("Sem conexão com a internet. Reconecte para continuar a operação.");
      return;
    }
    enableCamera();
  };

  return (
    <div className="cut-app-page cut-checkin-page">
      <NavlogComponent />
      {loading && <ProcessingIndicatorComponent label="Atualizando operação" />}
      <Container className="cut-page-container py-4 py-lg-5">
        <div className="cut-page-heading">
          <div><span className="cut-eyebrow">Operação do evento</span><h1>Validar entradas e retiradas</h1><p>O mesmo leitor aceita ingressos e QR Codes de produtos. Toda validação fica vinculada ao evento selecionado.</p></div>
          <Badge bg={eventId ? "success" : "secondary"} className="cut-live-badge">{eventId ? "Evento selecionado" : "Selecione um evento"}</Badge>
        </div>

        {error && <Alert variant="danger" role="alert">{error}</Alert>}
        {networkStatus === "offline" && <Alert variant="warning" role="alert">Operação sem internet. Novas validações estão bloqueadas até a conexão voltar.</Alert>}
        {cameraNotice && <Alert variant="info" role="status" aria-live="polite">{cameraNotice}</Alert>}

        {events.length === 0 && !loading ? (
          <Card className="cut-empty-state"><Card.Body><h2>Nenhum evento publicado para operar</h2><p>Publique um evento antes de abrir a operação.</p><Button onClick={() => navigate("/event/manage")}>Gerenciar eventos</Button></Card.Body></Card>
        ) : <>
          <Card className="cut-panel mb-4"><Card.Body className="p-4"><Row className="g-3 align-items-end"><Col lg={7}><Form.Group><Form.Label>Evento da operação *</Form.Label><Form.Select value={eventId} onChange={(event) => selectEvent(event.target.value)}><option value="">Selecione o evento</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</Form.Select></Form.Group></Col><Col lg={5}><div className="cut-checkin-stats" role="status" aria-live="polite"><span><strong>{stats?.issued ?? 0}</strong> emitidos</span><span><strong>{stats?.checked_in ?? 0}</strong> entradas</span><span><strong>{Math.max(0, Number(stats?.issued || 0) - Number(stats?.checked_in || 0))}</strong> aguardando</span></div></Col></Row></Card.Body></Card>

          <Row className="g-4 justify-content-center">
            <Col lg={7}><Card className="cut-panel cut-scanner-card"><Card.Body className="p-3 p-md-4">
              {!eventId ? <div className="cut-empty-state-inline"><h2>Selecione o evento</h2><p>A câmera só é liberada depois de escolher qual evento está sendo operado.</p></div> : result ? <div className={`cut-checkin-result cut-checkin-result--${result.type}`} role={result.type === "danger" ? "alert" : "status"} aria-live={result.type === "danger" ? "assertive" : "polite"}><i className={result.type === "success" ? "fa-solid fa-circle-check" : "fa-solid fa-triangle-exclamation"} aria-hidden="true" /><h2>{result.message}</h2>{result.pass && <div className="cut-checkin-person"><strong>{result.pass.holder_name || result.pass.holder_email || "Participante"}</strong><span>{result.pass.event?.title || "Evento"}</span><span>{result.pass.ticket?.name || "Ingresso"}</span></div>}{result.kind === "item" && Array.isArray(result.items) && <div className="cut-checkin-person"><strong>Entregue os itens abaixo</strong>{result.items.map((item) => <span key={item.id || item.event_item_id}>{item.quantity} × {item.name}</span>)}</div>}<Button size="lg" onClick={nextParticipant}>Próxima leitura</Button></div> : cameraEnabled ? <div className="cut-scanner"><Webcam ref={webcamRef} audio={false} className="cut-scanner__video" screenshotFormat="image/jpeg" videoConstraints={{ facingMode: { ideal: "environment" } }} onUserMediaError={(mediaError) => { setError(mediaError?.message || "Não foi possível acessar a câmera. Verifique a permissão do navegador."); disableCamera(); }} /><canvas ref={canvasRef} hidden /><div className="cut-scanner__frame" aria-hidden="true" /><span className="cut-scanner__hint" role="status" aria-live="polite">{readerMode === "native" ? "Leitor nativo ativo" : fallbackReady ? "Leitor compatível ativo" : "Preparando leitor QR..."} · posicione o QR no quadro</span></div> : <div className="cut-empty-state-inline"><i className="fa-solid fa-camera" aria-hidden="true" /><h2>Câmera pronta para iniciar</h2><p>Toque no botão para validar ingresso ou retirada de produtos.</p><Button size="lg" onClick={enableCamera} disabled={networkStatus === "offline"}>Ativar câmera</Button></div>}
            </Card.Body></Card></Col>

            <Col lg={5}><Card className="cut-panel h-100"><Card.Body className="p-4"><h2 className="cut-section-title">Validação manual</h2><p className="text-secondary">Use o código abaixo do QR apenas se a câmera estiver indisponível.</p><Form onSubmit={(event) => { event.preventDefault(); validate(token); }}><Form.Group><Form.Label>Código do QR</Form.Label><Form.Control value={token} onChange={(event) => setToken(event.target.value)} placeholder="CUT-..., PASS-... ou ITEM-..." autoComplete="off" /></Form.Group><Button className="w-100 mt-3" type="submit" disabled={!eventId || !token.trim() || loading || networkStatus === "offline"}>Validar QR Code</Button></Form><div className="cut-info-box mt-4"><strong>Proteção contra uso indevido</strong><span>O servidor confirma evento, operador, pagamento, validade do QR e utilização anterior antes de registrar entrada ou retirada.</span></div></Card.Body></Card></Col>
          </Row>
        </>}
      </Container>
    </div>
  );
}
