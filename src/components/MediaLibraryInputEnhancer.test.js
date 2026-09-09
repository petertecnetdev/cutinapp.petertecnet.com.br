import { isEligibleMediaLibraryInput, mediaLibraryTypeForInput } from "../utils/mediaLibraryInput";

describe("MediaLibraryInputEnhancer", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("enables the producer library for ordinary image uploads", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.name = "image";
    document.body.appendChild(input);

    expect(isEligibleMediaLibraryInput(input)).toBe(true);
    expect(mediaLibraryTypeForInput(input)).toBe("image");
  });

  test("enables the producer library for audio uploads", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/mpeg,audio/ogg,.wav";
    input.name = "soundtrack";
    document.body.appendChild(input);

    expect(isEligibleMediaLibraryInput(input)).toBe(true);
    expect(mediaLibraryTypeForInput(input)).toBe("audio");
  });

  test("enables the producer library for video uploads", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/mp4,video/webm";
    input.name = "video";
    document.body.appendChild(input);

    expect(isEligibleMediaLibraryInput(input)).toBe(true);
    expect(mediaLibraryTypeForInput(input)).toBe("video");
  });

  test("does not offer event media as an identity document", () => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = '<h2>Documento com foto</h2><input type="file" accept="image/jpeg,image/png,image/webp" name="front_document">';
    document.body.appendChild(card);

    expect(isEligibleMediaLibraryInput(card.querySelector("input"))).toBe(false);
  });

  test("supports an explicit opt-out for exceptional upload fields", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.dataset.mediaLibrary = "off";
    document.body.appendChild(input);

    expect(isEligibleMediaLibraryInput(input)).toBe(false);
  });

  test("does not attach the library to non-media file inputs", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "text/csv,application/zip";
    document.body.appendChild(input);

    expect(isEligibleMediaLibraryInput(input)).toBe(false);
  });
});
