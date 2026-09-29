import {
  EVENT_POSTER_HEIGHT,
  EVENT_POSTER_MAX_BYTES,
  EVENT_POSTER_SOURCE_MAX_BYTES,
  EVENT_POSTER_SOURCE_MAX_DIMENSION,
  EVENT_POSTER_SOURCE_MAX_PIXELS,
  EVENT_POSTER_WIDTH,
  validateEventPosterFile,
} from "./eventPoster";

describe("event poster media safety contract", () => {
  it("keeps the public event flyer contract at 1024x1536 (2:3)", () => {
    expect(EVENT_POSTER_WIDTH).toBe(1024);
    expect(EVENT_POSTER_HEIGHT).toBe(1536);
    expect(EVENT_POSTER_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it("rejects unsupported media before attempting to decode it", async () => {
    const result = await validateEventPosterFile(new File(["svg"], "poster.svg", { type: "image/svg+xml" }));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/JPG, PNG ou WebP/i);
  });

  it("rejects oversized source bytes before attempting to decode it", async () => {
    const file = {
      name: "poster.jpg",
      type: "image/jpeg",
      size: EVENT_POSTER_SOURCE_MAX_BYTES + 1,
    };
    const result = await validateEventPosterFile(file);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/30 MB/i);
  });

  it("keeps decoded-image limits bounded for browser canvas safety", () => {
    expect(EVENT_POSTER_SOURCE_MAX_DIMENSION).toBeLessThanOrEqual(12000);
    expect(EVENT_POSTER_SOURCE_MAX_PIXELS).toBeLessThanOrEqual(60 * 1000 * 1000);
  });
});
