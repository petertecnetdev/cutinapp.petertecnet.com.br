import { deriveMemoryTimeline } from "./profileActivity";

describe("profile memory artwork privacy", () => {
  const now = new Date("2026-09-23T12:00:00Z").getTime();

  test("hidden preferred artwork cannot leak and visible fallback is preserved", () => {
    const [memory] = deriveMemoryTimeline([
      {
        id: 1,
        end_date: "2026-09-22T12:00:00Z",
        image: { url: "/private.jpg", viewer_can_see: false },
        cover: { url: "/visible.jpg", viewer_can_see: true },
      },
    ], now);

    expect(memory.image).toMatchObject({ url: "/visible.jpg", viewer_can_see: true });
  });

  test("all explicitly hidden artwork aliases result in no memory artwork", () => {
    const [memory] = deriveMemoryTimeline([
      {
        id: 2,
        end_date: "2026-09-22T12:00:00Z",
        image: { url: "/image.jpg", visible: 0 },
        cover: { url: "/cover.jpg", viewer_can_see: "0" },
        flyer: { url: "/flyer.jpg", visible: false },
      },
    ], now);

    expect(memory.image).toBeNull();
  });

  test("legacy string artwork remains compatible", () => {
    const [memory] = deriveMemoryTimeline([
      {
        id: 3,
        end_date: "2026-09-22T12:00:00Z",
        flyer: "/legacy-flyer.jpg",
      },
    ], now);

    expect(memory.image).toBe("/legacy-flyer.jpg");
  });
});
