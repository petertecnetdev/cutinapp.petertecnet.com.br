import React, { useCallback, useEffect, useRef, useState } from "react";
import ambientMediaService from "../../services/AmbientMediaService";
import { spotifyUri, youtubeEmbedUrl } from "../../utils/ambientMedia";

let spotifyApiPromise = null;
const loadSpotifyApi = () => {
  if (spotifyApiPromise) return spotifyApiPromise;
  spotifyApiPromise = new Promise((resolve) => {
    const previous = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (api) => {
      if (typeof previous === "function") previous(api);
      resolve(api);
    };
    const existing = document.querySelector('script[src="https://open.spotify.com/embed/iframe-api/v1"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://open.spotify.com/embed/iframe-api/v1";
      script.async = true;
      document.body.appendChild(script);
    }
  });
  return spotifyApiPromise;
};

const readRememberedActivation = () => {
  try { return window.sessionStorage.getItem("cutinapp:ambient-music-enabled") === "1"; }
  catch (_) { return false; }
};

export default function AmbientMusicPlayer({ subjectType, subjectId, fallbackSubjectType, fallbackSubjectId }) {
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const audioRef = useRef(null);
  const youtubeRef = useRef(null);
  const spotifyMountRef = useRef(null);
  const spotifyControllerRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const load = async () => {
      let current = subjectId ? await ambientMediaService.publicMedia(subjectType, subjectId).catch(() => null) : null;
      if (!current && fallbackSubjectId) {
        current = await ambientMediaService.publicMedia(fallbackSubjectType, fallbackSubjectId).catch(() => null);
      }
      if (active) setMedia(current);
    };
    load().finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [subjectType, subjectId, fallbackSubjectType, fallbackSubjectId]);

  const rememberActivation = () => {
    try { window.sessionStorage.setItem("cutinapp:ambient-music-enabled", "1"); } catch (_) {}
  };

  const youtubeCommand = useCallback((func, args = []) => {
    youtubeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "https://www.youtube.com");
  }, []);

  const play = useCallback(async () => {
    if (!media) return;
    rememberActivation();
    setBlocked(false);
    setExpanded(true);
    if (media.provider === "audio" && audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, Number(media.volume ?? 35) / 100));
      try { await audioRef.current.play(); setPlaying(true); } catch (_) { setBlocked(true); setPlaying(false); }
      return;
    }
    if (media.provider === "youtube") {
      youtubeCommand("setVolume", [Number(media.volume ?? 35)]);
      youtubeCommand("playVideo");
      setPlaying(true);
      return;
    }
    if (media.provider === "spotify" && spotifyControllerRef.current) {
      spotifyControllerRef.current.play();
      setPlaying(true);
    }
  }, [media, youtubeCommand]);

  const pause = useCallback(() => {
    if (!media) return;
    if (media.provider === "audio") audioRef.current?.pause();
    if (media.provider === "youtube") youtubeCommand("pauseVideo");
    if (media.provider === "spotify") spotifyControllerRef.current?.pause();
    setPlaying(false);
  }, [media, youtubeCommand]);

  useEffect(() => {
    if (!media || media.provider !== "audio" || !audioRef.current) return;
    const audio = audioRef.current;
    audio.volume = Math.max(0, Math.min(1, Number(media.volume ?? 35) / 100));
    audio.currentTime = Number(media.start_seconds || 0);
    if (media.autoplay) {
      audio.play().then(() => setPlaying(true)).catch(() => setBlocked(true));
    }
  }, [media]);

  useEffect(() => {
    if (!media || media.provider !== "spotify" || !spotifyMountRef.current) return undefined;
    let disposed = false;
    let controller = null;
    loadSpotifyApi().then((api) => {
      if (disposed || !spotifyMountRef.current) return;
      const uri = spotifyUri(media);
      if (!uri) return;
      api.createController(spotifyMountRef.current, { uri, width: "100%", height: 152 }, (created) => {
        if (disposed) { created.destroy?.(); return; }
        controller = created;
        spotifyControllerRef.current = created;
        created.addListener?.("playback_started", () => setPlaying(true));
        created.addListener?.("playback_update", (event) => setPlaying(!event?.data?.isPaused));
        if (Number(media.start_seconds || 0) > 0) created.seek?.(Number(media.start_seconds));
        if (media.autoplay || readRememberedActivation()) created.play?.();
      });
    });
    return () => {
      disposed = true;
      if (controller) controller.destroy?.();
      spotifyControllerRef.current = null;
    };
  }, [media]);

  if (loading || !media?.enabled) return null;

  const title = media.title || (media.provider === "audio" ? "Trilha do evento" : "Música ambiente");
  const youtubeSrc = media.provider === "youtube" ? youtubeEmbedUrl(media, Boolean(media.autoplay)) : "";

  return (
    <aside className={`cut-ambient-player ${expanded ? "is-expanded" : "is-collapsed"}`} aria-label="Trilha ambiente">
      <div className="cut-ambient-player__header">
        <div>
          <span className="cut-ambient-player__eyebrow"><i className="fa-solid fa-wave-square" /> Trilha ambiente</span>
          <strong>{title}</strong>
          {media.artist && <small>{media.artist}</small>}
        </div>
        <div className="cut-ambient-player__actions">
          <button type="button" onClick={playing ? pause : play} aria-label={playing ? "Pausar música" : "Tocar música"}>
            <i className={`fa-solid ${playing ? "fa-pause" : "fa-play"}`} />
          </button>
          <button type="button" onClick={() => { if (expanded) pause(); setExpanded((value) => !value); }} aria-label={expanded ? "Recolher player" : "Abrir player"}>
            <i className={`fa-solid ${expanded ? "fa-chevron-down" : "fa-chevron-up"}`} />
          </button>
        </div>
      </div>

      {blocked && <button type="button" className="cut-ambient-player__activate" onClick={play}>Ativar música</button>}

      {expanded && <div className="cut-ambient-player__body">
        {media.provider === "youtube" && youtubeSrc && <iframe
          ref={youtubeRef}
          title={title}
          src={youtubeSrc}
          width="100%"
          height="210"
          frameBorder="0"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          onLoad={() => {
            youtubeCommand("setVolume", [Number(media.volume ?? 35)]);
            if (media.autoplay || readRememberedActivation()) youtubeCommand("playVideo");
          }}
        />}
        {media.provider === "spotify" && <div ref={spotifyMountRef} className="cut-ambient-player__spotify" />}
        {media.provider === "audio" && <div className="cut-ambient-player__audio">
          <audio ref={audioRef} src={media.source_url} loop={Boolean(media.loop)} preload="metadata" controls onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
        </div>}
      </div>}
    </aside>
  );
}
