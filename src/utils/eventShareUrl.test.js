import { buildEventShareUrl, eventShareVersion } from "./eventShareUrl";

describe("eventShareUrl", () => {
  it("builds the canonical public event URL with a cache-busting version", () => {
    const event = {
      id: 130,
      slug: "quarta-feira-sem-rotina",
      updated_at: "2026-09-08T18:40:12.000000Z",
    };

    expect(buildEventShareUrl({
      event,
      origin: "https://cutinapp.petertecnet.com.br",
    })).toBe("https://cutinapp.petertecnet.com.br/event/quarta-feira-sem-rotina?v=20260908184012000000");
  });

  it("falls back to the event id when updated_at is unavailable", () => {
    expect(eventShareVersion({ id: 42 })).toBe("42");
  });
});
