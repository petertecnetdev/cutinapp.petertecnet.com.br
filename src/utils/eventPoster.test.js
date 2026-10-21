import {
  EVENT_POSTER_HEIGHT,
  EVENT_POSTER_MAX_BYTES,
  EVENT_POSTER_SOURCE_MAX_BYTES,
  EVENT_POSTER_SOURCE_MAX_DIMENSION,
  EVENT_POSTER_SOURCE_MAX_PIXELS,
  EVENT_POSTER_WIDTH,
  normalizeEventPosterFile,
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

describe("automatic event and meetup cover adaptation", () => {
  it("normalizes a landscape JPG into an uploadable 1024x1536 JPEG without requiring a replacement", async () => {
    const originalImage = global.Image;
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
      save: jest.fn(),
      restore: jest.fn(),
      fillRect: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      scale: jest.fn(),
      drawImage: jest.fn(),
    }));
    const toBlob = jest.spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(new Blob(["converted"], { type: "image/jpeg" })));
    URL.createObjectURL = jest.fn(() => "blob:preview");
    URL.revokeObjectURL = jest.fn();
    global.Image = class {
      naturalWidth = 1600;
      naturalHeight = 900;
      set src(value) { if (value && this.onload) this.onload(); }
    };

    try {
      const result = await normalizeEventPosterFile(
        new File(["original"], "banner-paisagem.jpg", { type: "image/jpeg" }),
        { mode: "fit" },
      );
      expect(result).toBeInstanceOf(File);
      expect(result.name).toBe("banner-paisagem-1024x1536.jpg");
      expect(result.type).toBe("image/jpeg");
      expect(getContext).toHaveBeenCalled();
      expect(toBlob).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    } finally {
      global.Image = originalImage;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      getContext.mockRestore();
      toBlob.mockRestore();
    }
  });
});
