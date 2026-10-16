import { flyerImage, selectUpcomingFlyers } from "./eventFlyerCarouselData";

const now = new Date(2026, 9, 16, 13, 0, 0);

const event = (id, start_date, image = "flyer.jpg") => ({
  id, slug: "evento-" + id, title: "Evento " + id, start_date, image,
});

describe("vitrine dos próximos flyers", () => {
  test("ordena cronologicamente e remove eventos passados, cancelados e sem flyers", () => {
    const events = [
      event(1, "2026-10-17 20:00:00"),
      event(2, "2026-10-16 10:00:00"),
      event(3, "2026-10-17 16:00:00"),
      event(4, "2026-10-20 19:00:00", ""),
      { ...event(5, "2026-10-18 20:00:00"), status: "cancelled" },
      event(3, "2026-10-17 16:00:00"),
    ];
    expect(selectUpcomingFlyers(events, now).map((item) => item.id)).toEqual([3, 1]);
  });

  test("reconhece datas SQL e flyer alternativo", () => {
    const events = [{ id: 10, slug: "teste", starts_at: "2026-10-19 19:30:00", flyer: "/files/10.png" }];
    expect(selectUpcomingFlyers(events, now)).toHaveLength(1);
    expect(flyerImage(events[0])).toBe("/files/10.png");
  });

  test("não inventa flyers com dados ausentes ou datas inválidas", () => {
    expect(selectUpcomingFlyers(null, now)).toEqual([]);
    expect(selectUpcomingFlyers([event(1, "2020-01-01")], now)).toEqual([]);
    expect(selectUpcomingFlyers([event(1, "2026-02-31")], now)).toEqual([]);
  });

  test("limita a vitrine sem alterar a coleção original", () => {
    const data = [event(1, "2026-10-20"), event(2, "2026-10-18"), event(3, "2026-10-19")];
    const selected = selectUpcomingFlyers(data, now, 2);
    expect(selected.map((item) => item.id)).toEqual([2, 3]);
    expect(data.map((item) => item.id)).toEqual([1, 2, 3]);
  });
});
