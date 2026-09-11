import React, { useCallback, useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";

const supportedMimeType = () => {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported?.(candidate)) || "";
};

const formatDuration = (seconds) => {
  const value = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(value / 60);
  const remaining = value % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
};

export default function AudioRecorder({ disabled, onReady, onRecordingChange }) {
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const [state, setState] = useState("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const cleanup = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    onRecordingChange?.(false);
  }, [onRecordingChange]);

  useEffect(() => cleanup, [cleanup]);

  const start = async () => {
    if (disabled || state !== "idle") return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Seu navegador não oferece gravação de áudio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = supportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      setSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const actualType = recorder.mimeType || mimeType || "audio/webm";
        const extension = actualType.includes("mp4") ? "m4a" : actualType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        if (blob.size) {
          onReady?.(new File([blob], `audio-${Date.now()}.${extension}`, {
            type: actualType,
            lastModified: Date.now(),
          }));
        }
        setState("idle");
        cleanup();
      };

      recorder.start(250);
      setState("recording");
      onRecordingChange?.(true);
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch (requestError) {
      setError(requestError?.name === "NotAllowedError" ? "Permita o microfone para enviar áudio." : "Não foi possível iniciar o microfone.");
      cleanup();
    }
  };

  const pauseResume = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (state === "recording") {
      recorder.pause();
      setState("paused");
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    } else if (state === "paused") {
      recorder.resume();
      setState("recording");
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    }
  };

  const cancel = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = null;
    try { recorder.stop(); } catch (_) {}
    setState("idle");
    setSeconds(0);
    cleanup();
  };

  const finish = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    try { recorder.stop(); } catch (_) { cleanup(); setState("idle"); }
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  if (state === "idle") {
    return (
      <span className="cut-direct-recorder-wrap">
        <button type="button" className="cut-direct-composer__action" onClick={start} disabled={disabled} aria-label="Gravar áudio">
          <i className="fa-solid fa-microphone" />
        </button>
        {error && <span className="cut-direct-recorder-error" role="status">{error}</span>}
      </span>
    );
  }

  return (
    <div className="cut-direct-recorder">
      <span className="cut-direct-recorder__pulse" />
      <strong>{formatDuration(seconds)}</strong>
      <button type="button" onClick={pauseResume} aria-label={state === "recording" ? "Pausar gravação" : "Continuar gravação"}>
        <i className={state === "recording" ? "fa-solid fa-pause" : "fa-solid fa-play"} />
      </button>
      <button type="button" onClick={cancel} aria-label="Cancelar áudio"><i className="fa-regular fa-trash-can" /></button>
      <button type="button" className="is-send" onClick={finish} aria-label="Concluir áudio"><i className="fa-solid fa-arrow-up" /></button>
    </div>
  );
}

AudioRecorder.propTypes = {
  disabled: PropTypes.bool,
  onReady: PropTypes.func.isRequired,
  onRecordingChange: PropTypes.func,
};
