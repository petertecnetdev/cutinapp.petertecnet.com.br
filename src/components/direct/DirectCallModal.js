import React, { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import messagingService from "../../services/MessagingService";

const parseMetadata = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
};

const iceServers = () => {
  const configured = String(process.env.REACT_APP_RTC_ICE_SERVERS || "").trim();
  if (configured) {
    try {
      const parsed = JSON.parse(configured);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (_) {}
  }
  return [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
};

export default function DirectCallModal({
  conversationId,
  remoteUser,
  mode,
  type,
  initialCall,
  signal,
  onClose,
}) {
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const callIdRef = useRef(initialCall?.id || null);
  const statusRef = useRef(initialCall?.status || "ringing");
  const pendingLocalCandidatesRef = useRef([]);
  const pendingRemoteCandidatesRef = useRef([]);
  const startedRef = useRef(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [phase, setPhase] = useState(mode === "incoming" ? "incoming" : "connecting");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(type !== "video");
  const [error, setError] = useState("");

  const stopMedia = useCallback(() => {
    localStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (peerRef.current) {
      try { peerRef.current.close(); } catch (_) {}
    }
    peerRef.current = null;
  }, []);

  useEffect(() => () => stopMedia(), [stopMedia]);

  const updateCall = useCallback(async (status, metadata = {}) => {
    const callId = Number(callIdRef.current || 0);
    if (!callId) return null;
    statusRef.current = status;
    return messagingService.updateCall(conversationId, callId, status, metadata);
  }, [conversationId]);

  const flushLocalCandidates = useCallback(async () => {
    const candidates = [...pendingLocalCandidatesRef.current];
    pendingLocalCandidatesRef.current = [];
    for (const candidate of candidates) {
      try {
        await updateCall(statusRef.current || "ringing", { kind: "candidate", candidate });
      } catch (_) {}
    }
  }, [updateCall]);

  const addRemoteCandidate = useCallback(async (candidate) => {
    if (!candidate) return;
    const peer = peerRef.current;
    if (!peer?.remoteDescription) {
      pendingRemoteCandidatesRef.current.push(candidate);
      return;
    }
    try {
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (_) {}
  }, []);

  const flushRemoteCandidates = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer?.remoteDescription) return;
    const candidates = [...pendingRemoteCandidatesRef.current];
    pendingRemoteCandidatesRef.current = [];
    for (const candidate of candidates) {
      try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    }
  }, []);

  const createPeer = useCallback(async () => {
    if (peerRef.current) return peerRef.current;
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      throw new Error("Seu navegador não oferece suporte a chamadas WebRTC.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video" ? { facingMode: "user" } : false,
    });
    localStreamRef.current = stream;

    const peer = new RTCPeerConnection({ iceServers: iceServers() });
    peerRef.current = peer;
    remoteStreamRef.current = new MediaStream();

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      const target = remoteStreamRef.current;
      event.streams?.[0]?.getTracks?.().forEach((track) => {
        if (!target.getTracks().some((item) => item.id === track.id)) target.addTrack(track);
      });
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = target;
    };

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
      if (!callIdRef.current) {
        pendingLocalCandidatesRef.current.push(candidate);
        return;
      }
      updateCall(statusRef.current || "ringing", { kind: "candidate", candidate }).catch(() => undefined);
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setPhase("active");
        statusRef.current = "active";
      }
      if (["failed", "disconnected"].includes(peer.connectionState)) {
        setError("A conexão da chamada foi interrompida.");
      }
      if (peer.connectionState === "closed") setPhase("ended");
    };

    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return peer;
  }, [type, updateCall]);

  const startOutgoing = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("connecting");
    setError("");

    try {
      const peer = await createPeer();
      const offer = await peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === "video",
      });
      await peer.setLocalDescription(offer);
      const response = await messagingService.startCall(conversationId, type, {
        kind: "offer",
        sdp: peer.localDescription?.toJSON ? peer.localDescription.toJSON() : peer.localDescription,
      });
      const call = response?.data;
      if (!call?.id) throw new Error("Não foi possível iniciar a sessão de chamada.");
      callIdRef.current = call.id;
      statusRef.current = "ringing";
      setPhase("ringing");
      await flushLocalCandidates();
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || "Não foi possível iniciar a chamada.");
      setPhase("error");
      stopMedia();
    }
  }, [conversationId, createPeer, flushLocalCandidates, stopMedia, type]);

  useEffect(() => {
    if (mode === "outgoing") startOutgoing();
  }, [mode, startOutgoing]);

  const acceptIncoming = async () => {
    const call = initialCall || signal;
    const metadata = parseMetadata(call?.metadata);
    if (!call?.id || metadata.kind !== "offer" || !metadata.sdp) {
      setError("A oferta da chamada não está mais disponível.");
      return;
    }

    callIdRef.current = call.id;
    statusRef.current = "ringing";
    setPhase("connecting");
    setError("");

    try {
      const peer = await createPeer();
      await peer.setRemoteDescription(new RTCSessionDescription(metadata.sdp));
      await flushRemoteCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await updateCall("active", {
        kind: "answer",
        sdp: peer.localDescription?.toJSON ? peer.localDescription.toJSON() : peer.localDescription,
      });
      setPhase("active");
      await flushLocalCandidates();
    } catch (requestError) {
      setError(requestError?.message || "Não foi possível atender a chamada.");
      setPhase("error");
      stopMedia();
    }
  };

  useEffect(() => {
    if (!signal?.id) return;
    if (callIdRef.current && Number(signal.id) !== Number(callIdRef.current)) return;

    const metadata = parseMetadata(signal.metadata);

    if (!callIdRef.current && mode === "incoming") callIdRef.current = signal.id;

    if (["declined", "ended", "missed"].includes(signal.status)) {
      setPhase(signal.status);
      stopMedia();
      return;
    }

    if (metadata.kind === "answer" && metadata.sdp && mode === "outgoing") {
      const peer = peerRef.current;
      if (peer && !peer.remoteDescription) {
        peer.setRemoteDescription(new RTCSessionDescription(metadata.sdp))
          .then(flushRemoteCandidates)
          .then(() => {
            statusRef.current = "active";
            setPhase("active");
          })
          .catch(() => setError("Não foi possível concluir a conexão da chamada."));
      }
      return;
    }

    if (metadata.kind === "candidate" && metadata.candidate) {
      addRemoteCandidate(metadata.candidate);
    }
  }, [signal, mode, addRemoteCandidate, flushRemoteCandidates, stopMedia]);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
  }, [phase]);

  const endCall = async () => {
    try {
      if (callIdRef.current) await updateCall("ended", { kind: "hangup" });
    } catch (_) {}
    stopMedia();
    onClose?.();
  };

  const decline = async () => {
    callIdRef.current = initialCall?.id || signal?.id || callIdRef.current;
    try {
      if (callIdRef.current) await updateCall("declined", { kind: "decline" });
    } catch (_) {}
    stopMedia();
    onClose?.();
  };

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks?.().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  const toggleCamera = () => {
    if (type !== "video") return;
    const next = !cameraOff;
    localStreamRef.current?.getVideoTracks?.().forEach((track) => { track.enabled = !next; });
    setCameraOff(next);
  };

  const remoteName = remoteUser?.name || remoteUser?.user_name || "Contato";
  const ended = ["ended", "declined", "missed", "error"].includes(phase);

  return (
    <div className="cut-direct-call-layer" role="dialog" aria-modal="true" aria-label={type === "video" ? "Chamada de vídeo" : "Chamada de áudio"}>
      <div className={`cut-direct-call ${type === "video" ? "is-video" : "is-audio"}`}>
        <div className="cut-direct-call__stage">
          {type === "video" ? (
            <>
              <video ref={remoteVideoRef} className="cut-direct-call__remote-video" autoPlay playsInline />
              <video ref={localVideoRef} className="cut-direct-call__local-video" autoPlay playsInline muted />
            </>
          ) : (
            <div className="cut-direct-call__audio-hero">
              {remoteUser?.avatar ? <img src={remoteUser.avatar} alt={remoteName} /> : <span>{String(remoteName).trim().split(/\s+/).slice(0,2).map((part) => part[0]).join("").toUpperCase()}</span>}
            </div>
          )}

          <div className="cut-direct-call__identity">
            <strong>{remoteName}</strong>
            <span>
              {phase === "incoming" ? (type === "video" ? "Chamada de vídeo recebida" : "Chamada de áudio recebida") :
                phase === "ringing" ? "Chamando…" :
                phase === "connecting" ? "Conectando…" :
                phase === "active" ? "Em chamada" :
                phase === "declined" ? "Chamada recusada" :
                phase === "missed" ? "Chamada não atendida" :
                phase === "ended" ? "Chamada encerrada" : error || "Falha na chamada"}
            </span>
          </div>
        </div>

        {error && <div className="cut-direct-call__error">{error}</div>}

        <div className="cut-direct-call__controls">
          {phase === "incoming" ? (
            <>
              <button type="button" className="is-decline" onClick={decline}><i className="fa-solid fa-phone-slash" /><span>Recusar</span></button>
              <button type="button" className="is-accept" onClick={acceptIncoming}><i className={type === "video" ? "fa-solid fa-video" : "fa-solid fa-phone"} /><span>Atender</span></button>
            </>
          ) : !ended ? (
            <>
              <button type="button" className={muted ? "is-active" : ""} onClick={toggleMute}><i className={muted ? "fa-solid fa-microphone-slash" : "fa-solid fa-microphone"} /><span>Microfone</span></button>
              {type === "video" && <button type="button" className={cameraOff ? "is-active" : ""} onClick={toggleCamera}><i className={cameraOff ? "fa-solid fa-video-slash" : "fa-solid fa-video"} /><span>Câmera</span></button>}
              <button type="button" className="is-decline" onClick={endCall}><i className="fa-solid fa-phone-slash" /><span>Encerrar</span></button>
            </>
          ) : (
            <button type="button" onClick={onClose}><i className="fa-solid fa-xmark" /><span>Fechar</span></button>
          )}
        </div>
      </div>
    </div>
  );
}

DirectCallModal.propTypes = {
  conversationId: PropTypes.number.isRequired,
  remoteUser: PropTypes.object,
  mode: PropTypes.oneOf(["incoming", "outgoing"]).isRequired,
  type: PropTypes.oneOf(["audio", "video"]).isRequired,
  initialCall: PropTypes.object,
  signal: PropTypes.object,
  onClose: PropTypes.func.isRequired,
};
