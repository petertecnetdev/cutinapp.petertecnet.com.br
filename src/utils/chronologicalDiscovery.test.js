import { chronologicalBucketFor, groupEventsChronologically } from "./chronologicalDiscovery";

describe("chronological discovery", () => {
  const now = new Date("2026-09-22T12:00:00-03:00");

  it("labels today, tomorrow, explicit dates and next week", () => {
    expect(chronologicalBucketFor("2026-09-22T20:00:00-03:00", now).title).toBe("Hoje");
    expect(chronologicalBucketFor("2026-09-23T20:00:00-03:00", now).title).toBe("Amanhã");
    expect(chronologicalBucketFor("2026-09-25T20:00:00-03:00", now).key).toBe("date:2026-09-25");
    expect(chronologicalBucketFor("2026-09-30T20:00:00-03:00", now).title).toBe("Próxima semana");
  });

  it("sorts events chronologically and keeps next week in one section", () => {
    const groups = groupEventsChronologically([
      { id: 4, starts_at: "2026-10-01T20:00:00-03:00" },
      { id: 2, starts_at: "2026-09-23T20:00:00-03:00" },
      { id: 3, starts_at: "2026-09-30T20:00:00-03:00" },
      { id: 1, starts_at: "2026-09-22T21:00:00-03:00" },
    ], now);

    expect(groups.map((group) => group.title)).toEqual(["Hoje", "Amanhã", "Próxima semana"]);
    expect(groups[2].events.map((event) => event.id)).toEqual([3, 4]);
  });

  it("keeps events without a valid date in a clear fallback section", () => {
    const groups = groupEventsChronologically([{ id: 1, starts_at: null }], now);
    expect(groups[0].title).toBe("Data a confirmar");
  });
});
