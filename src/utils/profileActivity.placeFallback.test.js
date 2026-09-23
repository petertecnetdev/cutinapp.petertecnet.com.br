import { deriveMemoryTimeline } from "./profileActivity";

describe("profile memory place fallback", () => {
  const now = new Date("2026-09-23T12:00:00Z").getTime();

  test("empty visible place object cannot mask a usable establishment", () => {
    const [memory] = deriveMemoryTimeline([
      {
        id: 30,
        end_date: "2026-09-22T12:00:00Z",
        place: { viewer_can_see: true },
        establishment: { id: 8, name: "Lugar autorizado", viewer_can_see: true },
      },
    ], now);

    expect(memory.place).toMatchObject({ id: 8, name: "Lugar autorizado" });
  });

  test("hidden place still cannot mask a usable authorized establishment", () => {
    const [memory] = deriveMemoryTimeline([
      {
        id: 31,
        end_date: "2026-09-22T12:00:00Z",
        place: { id: 7, name: "Privado", viewer_can_see: false },
        establishment: { slug: "publico", name: "Público" },
      },
    ], now);

    expect(memory.place).toMatchObject({ slug: "publico", name: "Público" });
  });

  test("blank legacy place strings do not become memories locations", () => {
    const [memory] = deriveMemoryTimeline([
      {
        id: 32,
        end_date: "2026-09-22T12:00:00Z",
        place: "   ",
      },
    ], now);

    expect(memory.place).toBeNull();
  });
});
