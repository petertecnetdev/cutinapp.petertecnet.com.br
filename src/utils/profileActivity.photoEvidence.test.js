import { normalizeEventMemory } from "./profileActivity";

describe("profile memory photo evidence", () => {
  test("keeps only usable visible photo references", () => {
    const memory = normalizeEventMemory({
      id: 1,
      photos: [
        "   ",
        "/legacy.jpg",
        { src: "/src.jpg" },
        { url: "   " },
        { path: "\t" },
        { url: "/private.jpg", viewer_can_see: false },
        { path: "/hidden.jpg", visible: "0" },
        {},
      ],
    });

    expect(memory.photos).toEqual(["/legacy.jpg", { src: "/src.jpg" }]);
  });

  test("falls back when the preferred event image only contains blank references", () => {
    const memory = normalizeEventMemory({
      id: 2,
      image: { url: "   " },
      cover: { src: "/cover.jpg" },
    });

    expect(memory.image).toEqual({ src: "/cover.jpg" });
  });
});
