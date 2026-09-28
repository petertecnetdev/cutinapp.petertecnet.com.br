import { buildEventShareUrl, eventShareVersion } from "./eventShareUrl";

describe("eventShareUrl", () => {
  it("builds an attributable public event share URL with a cache-busting version", () => {
    const event = {
      id: 130,
      slug: "quarta-feira-sem-rotina",
      updated_at: "2026-09-08T18:40:12.000000Z",
    };

    expect(buildEventShareUrl({
      event,
      origin: "https://cutinapp.petertecnet.com.br",
    })).toBe("https://cutinapp.petertecnet.com.br/event/quarta-feira-sem-rotina?v=20260908184012000000&utm_source=cutinapp&utm_medium=event_share&utm_campaign=event_share");
  });

  it("falls back to the event id when updated_at is unavailable", () => {
    expect(eventShareVersion({ id: 42 })).toBe("42");
  });

  it("adds campaign attribution to public event share URLs", () => {
    const url = buildEventShareUrl({
      event: { id: 42, slug: "night-show" },
      origin: "https://cutinapp.petertecnet.com.br",
      channel: "native_share",
    });

    expect(url).toContain("utm_source=cutinapp");
    expect(url).toContain("utm_medium=native_share");
    expect(url).toContain("utm_campaign=event_share");
  });
});
