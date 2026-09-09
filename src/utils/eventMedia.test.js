import { classifyImageQuality, eventMediaPath } from "./eventMedia";

describe("event media helpers", () => {
  test("derives sibling variants from the optimized hero path", () => {
    const image = "images/events/abc/hero.webp";
    expect(eventMediaPath(image, "card")).toBe("images/events/abc/card.webp");
    expect(eventMediaPath(image, "background")).toBe("images/events/abc/background.webp");
    expect(eventMediaPath(image, "og")).toBe("images/events/abc/og.webp");
    expect(eventMediaPath(image, "original")).toBe("images/events/abc/original.webp");
  });

  test("keeps legacy event images compatible", () => {
    const image = "images/events/legacy.webp";
    expect(eventMediaPath(image, "card")).toBe(image);
  });

  test("preserves absolute pipeline urls while changing the variant", () => {
    const image = "https://api.example.com/storage/images/events/abc/hero.webp?v=1";
    expect(eventMediaPath(image, "og")).toBe("https://api.example.com/storage/images/events/abc/og.webp?v=1");
  });

  test.each([
    [1080, "excellent"],
    [900, "good"],
    [720, "acceptable"],
    [480, "low"],
    [479, "very-low"],
  ])("classifies %ipx as %s", (width, expected) => {
    expect(classifyImageQuality(width).level).toBe(expected);
  });
});
