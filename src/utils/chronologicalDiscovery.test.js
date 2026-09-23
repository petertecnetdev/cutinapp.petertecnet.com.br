import { chronologicalBucketFor, groupEventsChronologically } from "./chronologicalDiscovery";

describe("chronological discovery", () => {
  const now = new Date(2026, 8, 22, 12, 0, 0);

  it("labels today, tomorrow, explicit dates and next week", () => {
    expect(chronologicalBucketFor(new Date(2026, 8, 22, 20, 0, 0), now).title).toBe("Hoje");
    expect(chronologicalBucketFor(new Date(2026, 8, 23, 20, 0, 0), now).title).toBe("Amanhã");
    expect(chronologicalBucketFor(new Date(2026, 8, 25, 20, 0, 0), now).key).toBe("date:2026-09-25");
    expect(chronologicalBucketFor(new Date(2026, 8, 30, 20, 0, 0), now).title).toBe("Próxima semana");
  });

  it("uses the viewer local calendar date instead of UTC for section keys", () => {
    const event = new Date(2026, 8, 25, 23, 30);
    expect(chronologicalBucketFor(event, now).key).toBe("date:2026-09-25");
  });

  it("treats date-only API values as local calendar days", () => {
    expect(chronologicalBucketFor("2026-09-22", now).title).toBe("Hoje");
    expect(chronologicalBucketFor("2026-09-23", now).title).toBe("Amanhã");

    const groups = groupEventsChronologically([
      { id: 2, start_date: "2026-09-23" },
      { id: 1, start_date: "2026-09-22" },
    ], now);

    expect(groups.map((group) => group.title)).toEqual(["Hoje", "Amanhã"]);
    expect(groups.map((group) => group.events[0].id)).toEqual([1, 2]);
  });

  it("sorts events chronologically and keeps next week in one section", () => {
    const groups = groupEventsChronologically([
      { id: 4, starts_at: new Date(2026, 9, 1, 20, 0, 0) },
      { id: 2, starts_at: new Date(2026, 8, 23, 20, 0, 0) },
      { id: 3, starts_at: new Date(2026, 8, 30, 20, 0, 0) },
      { id: 1, starts_at: new Date(2026, 8, 22, 21, 0, 0) },
    ], now);

    expect(groups.map((group) => group.title)).toEqual(["Hoje", "Amanhã", "Próxima semana"]);
    expect(groups[2].events.map((event) => event.id)).toEqual([3, 4]);
  });

  it("keeps events without a valid date in a clear fallback section", () => {
    const groups = groupEventsChronologically([{ id: 1, starts_at: null }], now);
    expect(groups[0].title).toBe("Data a confirmar");
  });
});
