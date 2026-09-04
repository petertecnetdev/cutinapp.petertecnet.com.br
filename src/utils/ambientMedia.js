export const defaultAmbientMediaForm = {
  provider: "youtube",
  source_url: "",
  title: "",
  artist: "",
  enabled: true,
  autoplay: true,
  loop: true,
  volume: 35,
  start_seconds: 0,
};

export const detectAmbientProvider = (value = "") => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be" || host.endsWith("youtube.com") || host === "www.youtube-nocookie.com") return "youtube";
    if (host === "open.spotify.com" || host === "spotify.link") return "spotify";
    if (url.protocol === "https:") return "audio";
  } catch (_) {}
  return null;
};

export const youtubeEmbedUrl = (media, autoplay = false) => {
  const externalId = String(media?.external_id || "");
  const params = new URLSearchParams({
    autoplay: autoplay ? "1" : "0",
    playsinline: "1",
    enablejsapi: "1",
    origin: typeof window !== "undefined" ? window.location.origin : "",
    rel: "0",
  });
  if (Number(media?.start_seconds || 0) > 0) params.set("start", String(media.start_seconds));
  if (externalId.startsWith("playlist:")) {
    params.set("list", externalId.slice("playlist:".length));
    params.set("loop", media?.loop ? "1" : "0");
    return `https://www.youtube.com/embed/videoseries?${params.toString()}`;
  }
  if (!externalId) return "";
  if (media?.loop) {
    params.set("loop", "1");
    params.set("playlist", externalId);
  }
  return `https://www.youtube.com/embed/${externalId}?${params.toString()}`;
};

export const spotifyUri = (media) => {
  const value = String(media?.external_id || "");
  const [type, id] = value.split(":");
  return type && id ? `spotify:${type}:${id}` : null;
};
