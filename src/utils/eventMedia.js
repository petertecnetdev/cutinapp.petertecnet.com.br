import { storageUrl } from "../config";

export const resolveEventMediaUrl = (value) => {
  if (!value) return "";
  const media = String(value);
  return /^https?:\/\//i.test(media) ? media : `${storageUrl}${media.replace(/^\/+/, "")}`;
};

export const youtubeVideoId = (value) => {
  if (!value) return "";

  try {
    const url = new URL(String(value).trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";

    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      id = url.searchParams.get("v") || "";
      if (!id) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1] || "";
      }
    }

    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : "";
  } catch (_) {
    return "";
  }
};

export const youtubeEmbedUrl = (value, { autoplay = false } = {}) => {
  const id = youtubeVideoId(value);
  if (!id) return "";

  const params = new URLSearchParams({
    rel: "0",
    playsinline: "1",
    modestbranding: "1",
  });

  if (autoplay) {
    params.set("autoplay", "1");
    params.set("mute", "1");
  }

  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
};
