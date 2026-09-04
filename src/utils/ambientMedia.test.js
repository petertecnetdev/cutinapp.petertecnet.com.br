import { detectAmbientProvider, spotifyUri, youtubeEmbedUrl } from "./ambientMedia";

describe("ambientMedia helpers", () => {
  test("detects supported music providers", () => {
    expect(detectAmbientProvider("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(detectAmbientProvider("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("youtube");
    expect(detectAmbientProvider("https://open.spotify.com/track/123ABC")).toBe("spotify");
    expect(detectAmbientProvider("https://cdn.example.com/audio/entrada.mp3")).toBe("audio");
  });

  test("builds a looping YouTube embed for a video", () => {
    const url = new URL(youtubeEmbedUrl({ external_id: "abc123", loop: true, start_seconds: 12 }, true));
    expect(url.pathname).toBe("/embed/abc123");
    expect(url.searchParams.get("autoplay")).toBe("1");
    expect(url.searchParams.get("loop")).toBe("1");
    expect(url.searchParams.get("playlist")).toBe("abc123");
    expect(url.searchParams.get("start")).toBe("12");
    expect(url.searchParams.get("enablejsapi")).toBe("1");
  });

  test("builds YouTube playlist embeds", () => {
    const url = new URL(youtubeEmbedUrl({ external_id: "playlist:PL123", loop: true }, false));
    expect(url.pathname).toBe("/embed/videoseries");
    expect(url.searchParams.get("list")).toBe("PL123");
    expect(url.searchParams.get("loop")).toBe("1");
  });

  test("builds Spotify URI from stored external id", () => {
    expect(spotifyUri({ external_id: "track:4uLU6hMCjMI75M1A2tKUQC" })).toBe("spotify:track:4uLU6hMCjMI75M1A2tKUQC");
    expect(spotifyUri({ external_id: null })).toBeNull();
  });
});
