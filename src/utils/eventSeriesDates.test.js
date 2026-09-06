import { addCalendarDays, calendarWeekday, seriesDefaults, toDateInput } from "./eventSeriesDates";

describe("eventSeriesDates", () => {
  test("preserves the API calendar date instead of shifting it by timezone", () => {
    expect(toDateInput("2026-09-10T00:00:00.000Z")).toBe("2026-09-10");
    expect(calendarWeekday("2026-09-10T00:00:00.000Z")).toBe(4);
  });

  test("adds days using calendar arithmetic", () => {
    expect(addCalendarDays("2026-12-28", 7)).toBe("2027-01-04");
  });

  test("starts a future series after the model event", () => {
    expect(seriesDefaults("2026-10-20T23:30:00Z", "2026-09-07")).toEqual({
      sourceDate: "2026-10-20",
      candidateDate: "2026-10-27",
      rangeStart: "2026-10-27",
      rangeEnd: "2026-12-22",
      weekday: 2,
    });
  });

  test("never proposes a date before tomorrow for an old model event", () => {
    const defaults = seriesDefaults("2026-08-01T03:00:00Z", "2026-09-07");
    expect(defaults.candidateDate).toBe("2026-09-07");
    expect(defaults.rangeStart).toBe("2026-09-07");
  });

  test("rejects impossible date-only values", () => {
    expect(toDateInput("2026-02-31")).toBe("");
  });
});
