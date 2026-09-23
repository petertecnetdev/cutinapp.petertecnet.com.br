import { normalizeEventMemory } from "./profileActivity";

describe("profile memory photo evidence", () => {
  test("keeps only usable visible photo references", () => {
    const memory = normalizeEventMemory({
      id: 1,
      photos: [
        "   ",
        "/legacy.jpg",
        { src: "/src.jpg" },
        { url: "/private.jpg", viewer_can_see: false },
        { path: "/hidden.jpg", visible: "0" },
        {},
      ],
    });

    expect(memory.photos).toEqual(["/legacy.jpg", { src: "/src.jpg" }]);
  });
});
