import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Card, Col, Container, Form, Row } from "react-bootstrap";
import { useLocation } from "react-router-dom";
import Webcam from "react-webcam";
import jsQR from "jsqr";
import NavlogComponent from "../../components/NavlogComponent";
import ProcessingIndicatorComponent from "../../components/ProcessingIndicatorComponent";
import commerceService from "../../services/CommerceService";
import cutinappService from "../../services/CutinappService";
import eventService from "../../services/EventService";
import { getNetworkStatus, isNetworkFailure, subscribeToNetworkStatus } from "../../utils/networkStatus";

const tokenKind = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized.startsWith("ITEM-")) return "item";
  if (normalized.startsWith("CUT-") || normalized.startsWith("PASS-")) return "ticket";
  return null;
};

const trackCheckinOperation = (type, { eventId, kind = null, readerMode = null, status = 0 } = {}) => {
  try {
    window.PeterTecnetTelemetry?.track?.(type, {
      label: kind === "item" ? "Retirada de item" : kind === "ticket" ? "Validação de ingresso" : "Leitura de QR Code",
      target: String(eventId || ""),
      metadata: { event_id: Number(eventId || 0), qr_kind: kind, reader_mode: readerMode, http_status: Number(status || 0) },
    });
  } catch (_) {
    // Observability must never interrupt gate operation.
  }
};

const loadJsQr = () => Promise.resolve(jsQR);

export default function CheckinPage() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const scanningRef = useRef(false);
  const decodingRef = useRef(false);
  const statsRequestRef = useRef(0);
  const location = useLocation();
  const requestedEventId = new URLSearchParams(location.search).get("eventId") || "";
  const selectedEventRef = useRef(requestedEventId);

  const [events, setEvents] = useState([]);
  const [eventSearch, setEventSearch] = useState("");
  const [debouncedEventSearch, setDebouncedEventSearch] = useState("");
  const [eventPage, setEventPage] = useState(1);
  const [eventLastPage, setEventLastPage] = useState(1);
  const [loadingMoreEvents, setLoadingMoreEvents] = useState(false);
  const [eventId, setEventId] = useState(requestedEventId);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraNotice, setCameraNotice] = useState("");
  const [readerMode, setReaderMode] = useState(window.BarcodeDetector ? "native" : "fallback");
  const [fallbackReady, setFallbackReady] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [stats, setStats] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [networkStatus, setNetworkStatus] = useState(() => getNetworkStatus());

  const stopCameraStream = useCallback(() => {
    const stream = webcamRef.current?.video?.srcObject;
    if (stream && typeof stream.getTracks === "function") stream.getTracks().forEach((track) => track.stop());
  }, []);

  const disableCamera = useCallback(() => {
    stopCameraStream();
    setCameraEnabled(false);
  }, [stopCameraStream]);

  const enableCamera = useCallback(() => {
    if (readerMode === "fallback" && fallbackFailed) {
      setCameraNotice("Leitor por câmera indisponível neste navegador. Use a validação manual pelo código impresso abaixo do QR.");
      return;
    }
    setCameraNotice("");
    setError("");
    setCameraEnabled(true);
  }, [fallbackFailed, readerMode]);

  const refreshStats = useCallback(async (selectedEventId) => {
    const requestId = ++statsRequestRef.current;
    if (!selectedEventId) {
      setStats(null);
      return;
    }
    try {
      const nextStats = await cutinappService.checkInStats(selectedEventId);
      if (requestId !== statsRequestRef.current) return;
      setStats(nextStats);
    } catch (err) {
      if (requestId !== statsRequestRef.current) return;
      setStats(null);
      setError(err?.message || "Não foi possível carregar os dados da portaria.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedEventSearch(eventSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [eventSearch]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    eventService.checkinEvents({ q: debouncedEventSearch || undefined })

      .then((page) => {
        if (!active) return;
        const available = Array.isArray(page?.data) ? page.data : [];
        setEvents(available);
        setEventPage(Math.max(1, Number(page?.current_page) || 1));
        setEventLastPage(Math.max(1, Number(page?.last_page) || 1));
        const validRequested = available.some((item) => String(item.id) === String(requestedEventId));
        const previous = selectedEventRef.current;
        const initial = previous || (validRequested ? String(requestedEventId) : (available.length === 1 ? String(available[0].id) : ""));
        selectedEventRef.current = initial;
        setEventId(initial);
        return refreshStats(initial);
      })
      .catch((err) => active && setError(err?.response?.data?.message || err?.message || "Não foi possível carregar os eventos disponíveis para sua portaria."))
      .finally(() => active && setLoading(false));
    return () => { active = false; statsRequestRef.current += 1; };
  }, [refreshStats, requestedEventId, debouncedEventSearch]);

  const loadMoreEvents = async () => {
    if (loadingMoreEvents || eventPage >= eventLastPage) return;
    setLoadingMoreEvents(true);
    try {
      const page = await eventService.checkinEvents({
        q: debouncedEventSearch || undefined,
        page: eventPage + 1,
      });
      const incoming = Array.isArray(page?.data) ? page.data : [];
      setEvents((current) => [...current, ...incoming.filter((event) => !current.some((item) => item.id === event.id))]);
      setEventPage(Math.max(1, Number(page?.current_page) || eventPage + 1));
      setEventLastPage(Math.max(1, Number(page?.last_page) || 1));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Não foi possível carregar mais eventos.");
    } finally {
      setLoadingMoreEvents(false);
    }
  };

  useEffect(() => {
    if (readerMode !== "fallback" || fallbackReady) return;
    setFallbackFailed(false);
    loadJsQr().then(() => {
      setFallbackReady(true);
      trackCheckinOperation("checkin_reader_fallback_ready", { eventId, readerMode });
    }).catch((err) => {
      setFallbackFailed(true);
      disableCamera();
      trackCheckinOperation("checkin_reader_fallback_unavailable", { eventId, readerMode });
      setCameraNotice("A câmera não pôde preparar o leitor QR alternativo. Use a validação manual pelo código impresso abaixo do QR.");
      setError(err?.message || "Seu navegador não conseguiu carregar o leitor QR alternativo.");
    });
  }, [disableCamera, eventId, fallbackReady, readerMode]);

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
      setCameraNotice((notice) => notice.startsWith("Sem conexão") ? "Conexão restabelecida. Você já pode reativar a câmera e continuar a operação." : notice);
    }
  }), [cameraEnabled, disableCamera]);

  useEffect(() => () => stopCameraStream(), [stopCameraStream]);

  const validate = useCallback(async (rawToken) => {
    const normalized = String(rawToken || "").trim();
    const kind = tokenKind(normalized);
    if (!eventId) { setError("Selecione o evento antes de validar o QR Code."); return; }
    if (!normalized || scanningRef.current) return;
    if (!kind) {
      trackCheckinOperation("checkin_qr_unrecognized", { eventId, readerMode });
      setResult({ type: "danger", kind: null, message: "QR Code não reconhecido pela Cutinapp." });
      return;
    }
    if (getNetworkStatus() === "offline") {
      trackCheckinOperation("checkin_validation_blocked_network", { eventId, kind, readerMode });
      setError("");
      setResult({ type: "warning", kind, message: "Sem conexão com a internet. Reconecte antes de validar este QR Code.", pass: null });
      disableCamera();
      return;
    }

    scanningRef.current = true;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = kind === "item" ? await commerceService.redeemEventItems(normalized, eventId) : await cutinappService.checkIn(normalized, eventId);
      trackCheckinOperation("checkin_validation_succeeded", { eventId, kind, readerMode });
      setResult({ type: "success", kind, ...response });
      setToken("");
      disableCamera();
      await refreshStats(eventId);
    } catch (err) {
      const networkFailure = isNetworkFailure(err);
      const status = Number(err?.status || err?.original?.response?.status || 0);
      trackCheckinOperation(networkFailure ? "checkin_validation_uncertain" : "checkin_validation_rejected", { eventId, kind, readerMode, status });
      const pass = kind === "ticket" ? err?.original?.response?.data?.pass || null : null;
      setResult({
        type: networkFailure || err?.status === 409 ? "warning" : "danger",
        kind,
        message: networkFailure ? "A conexão caiu durante a validação. O servidor pode ter registrado a operação. Reconecte e valide o mesmo QR novamente; a Cutinapp impedirá uma segunda utilização." : err?.message || (kind === "item" ? "Não foi possível confirmar a retirada." : "Não foi possível validar esta entrada."),
        pass,
      });
      disableCamera();
      if (!networkFailure) await refreshStats(eventId);
    } finally {
      setLoading(false);
      window.setTimeout(() => { scanningRef.current = false; }, 700);
    }
  }, [disableCamera, eventId, readerMode, refreshStats]);

  useEffect(() => {
    if (!cameraEnabled || !eventId) return undefined;
    let cancelled = false;
    let detector = null;
    if (readerMode === "native" && window.BarcodeDetector) {
      try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); }
      catch { setReaderMode("fallback"); return undefined; }
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
        } else if (fallbackReady && canvasRef.current) {
          const canvas = canvasRef.current;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          rawValue = String(jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "attemptBoth" })?.data || "");
        }
        if (tokenKind(rawValue)) await validate(rawValue);
      } catch {
        // Uma falha isolada de frame não encerra a operação; o próximo frame tenta novamente.
      } finally { decodingRef.current = false; }
    };
    const timer = window.setInterval(scan, 450);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [cameraEnabled, eventId, fallbackReady, readerMode, validate]);

  const selectEvent = async (value) => {
    selectedEventRef.current = value;
    setEventId(value);
    disableCamera();
    setCameraNotice("");
    setResult(null);
    setToken("");
    setError("");
    await refreshStats(value);
  };

  const nextParticipant = () => {
    setResult(null); setError(""); setToken("");
    if (networkStatus === "offline") { setCameraNotice("Sem conexão com a internet. Reconecte para continuar a operação."); return; }
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
        <>
          <Card className="cut-panel mb-4"><Card.Body className="p-4"><Row className="g-3 align-items-end"><Col lg={7}><Form.Group>
                <Form.Label>Buscar evento ou produção</Form.Label>
                <Form.Control
                  type="search"
                  value={eventSearch}
                  onChange={(event) => setEventSearch(event.target.value)}
                  placeholder="Nome do evento ou da produção"
                  aria-label="Buscar eventos da portaria"
                />
                <Form.Label className="mt-3">Evento da operação *</Form.Label>
                <Form.Select value={eventId} onChange={(event) => selectEvent(event.target.value)}>
                  <option value="">Selecione o evento</option>
                  {eventId && !events.some((item) => String(item.id) === String(eventId)) && <option value={eventId}>{stats?.event?.title || `Evento #${eventId}`} (selecionado)</option>}
                  {events.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.production?.name || "Produção"} · {item.start_date ? new Date(item.start_date).toLocaleDateString("pt-BR") : "Sem data"}</option>)}
                </Form.Select>
                {events.length === 0 && !loading && <small className="d-block mt-2 text-secondary">Nenhum evento encontrado. Tente outro nome.</small>}
                {eventPage < eventLastPage && <Button size="sm" variant="outline-light" className="mt-2" onClick={loadMoreEvents} disabled={loadingMoreEvents}>{loadingMoreEvents ? "Carregando..." : "Carregar mais eventos"}</Button>}
              </Form.Group></Col><Col lg={5}><div className="cut-checkin-stats" role="status" aria-live="polite"><span><strong>{stats?.issued ?? 0}</strong> emitidos</span><span><strong>{stats?.checked_in ?? 0}</strong> entradas</span><span><strong>{Math.max(0, Number(stats?.issued || 0) - Number(stats?.checked_in || 0))}</strong> aguardando</span></div></Col></Row></Card.Body></Card>
          <Row className="g-4 justify-content-center">
            <Col lg={7}><Card className="cut-panel cut-scanner-card"><Card.Body className="p-3 p-md-4">
              {!eventId ? <div className="cut-empty-state-inline"><h2>Selecione o evento</h2><p>A câmera só é liberada depois de escolher qual evento está sendo operado.</p></div> : result ? <div className={`cut-checkin-result cut-checkin-result--${result.type}`} role={result.type === "danger" ? "alert" : "status"} aria-live={result.type === "danger" ? "assertive" : "polite"}><i className={result.type === "success" ? "fa-solid fa-circle-check" : "fa-solid fa-triangle-exclamation"} aria-hidden="true" /><h2>{result.message}</h2>{result.pass && <div className="cut-checkin-person"><strong>{result.pass.holder_name || result.pass.holder_email || "Participante"}</strong><span>{result.pass.event?.title || "Evento"}</span><span>{result.pass.ticket?.name || "Ingresso"}</span></div>}{result.kind === "item" && Array.isArray(result.items) && <div className="cut-checkin-person"><strong>Entregue os itens abaixo</strong>{result.items.map((item) => <span key={item.id || item.event_item_id}>{item.quantity} × {item.name}</span>)}</div>}<Button size="lg" onClick={nextParticipant}>Próxima leitura</Button></div> : cameraEnabled ? <div className="cut-scanner"><Webcam ref={webcamRef} audio={false} className="cut-scanner__video" screenshotFormat="image/jpeg" videoConstraints={{ facingMode: { ideal: "environment" } }} onUserMediaError={(mediaError) => { setError(mediaError?.message || "Não foi possível acessar a câmera. Verifique a permissão do navegador."); disableCamera(); }} /><canvas ref={canvasRef} hidden /><div className="cut-scanner__frame" aria-hidden="true" /><span className="cut-scanner__hint" role="status" aria-live="polite">{readerMode === "native" ? "Leitor nativo ativo" : fallbackReady ? "Leitor compatível ativo" : "Preparando leitor QR..."} · posicione o QR no quadro</span></div> : <div className="cut-empty-state-inline"><i className="fa-solid fa-camera" aria-hidden="true" /><h2>Câmera pronta para iniciar</h2><p>Toque no botão para validar ingresso ou retirada de produtos.</p><Button size="lg" onClick={enableCamera} disabled={networkStatus === "offline" || (readerMode === "fallback" && fallbackFailed)}>Ativar câmera</Button></div>}
            </Card.Body></Card></Col>
            <Col lg={5}><Card className="cut-panel h-100"><Card.Body className="p-4"><h2 className="cut-section-title">Validação manual</h2><p className="text-secondary">Use o código abaixo do QR apenas se a câmera estiver indisponível.</p><Form onSubmit={(event) => { event.preventDefault(); validate(token); }}><Form.Group><Form.Label>Código do QR</Form.Label><Form.Control value={token} onChange={(event) => setToken(event.target.value)} placeholder="CUT-..., PASS-... ou ITEM-..." autoComplete="off" /></Form.Group><Button className="w-100 mt-3" type="submit" disabled={!eventId || !token.trim() || loading || networkStatus === "offline"}>Validar QR Code</Button></Form><div className="cut-info-box mt-4"><strong>Proteção contra uso indevido</strong><span>O servidor confirma evento, operador, pagamento, validade do QR e utilização anterior antes de registrar entrada ou retirada.</span></div></Card.Body></Card></Col>
          </Row>
        </>
      </Container>
    </div>
  );
}
