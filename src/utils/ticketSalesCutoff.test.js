import {
  buildSalesCutoffRule,
  calculateSalesCutoffForEvent,
  describeSalesCutoffRule,
} from "./ticketSalesCutoff";

const event = {
  start_date: "2026-09-10T22:00:00-03:00",
  end_date: "2026-09-11T04:00:00-03:00",
};
const now = new Date("2026-09-08T10:00:00-03:00");

test("defaults ticket sales cutoff to event start", () => {
  const rule = buildSalesCutoffRule();
  const result = calculateSalesCutoffForEvent(event, rule, now);

  expect(rule).toEqual({ mode: "at_start", offsetMinutes: 0 });
  expect(result.valid).toBe(true);
  expect(result.date.toISOString()).toBe(new Date(event.start_date).toISOString());
  expect(describeSalesCutoffRule(rule)).toBe("Até o início do evento");
});

test("calculates two hours after each event start", () => {
  const rule = buildSalesCutoffRule({ preset: "after_start_120" });
  const result = calculateSalesCutoffForEvent(event, rule, now);

  expect(rule).toEqual({ mode: "after_start", offsetMinutes: 120 });
  expect(result.date.toISOString()).toBe(new Date("2026-09-11T00:00:00-03:00").toISOString());
  expect(result.clamped).toBe(false);
});

test("never previews a cutoff after the event end", () => {
  const shortEvent = {
    start_date: "2026-09-10T22:00:00-03:00",
    end_date: "2026-09-10T23:00:00-03:00",
  };
  const rule = buildSalesCutoffRule({ preset: "after_start_120" });
  const result = calculateSalesCutoffForEvent(shortEvent, rule, now);

  expect(result.valid).toBe(true);
  expect(result.clamped).toBe(true);
  expect(result.date.toISOString()).toBe(new Date(shortEvent.end_date).toISOString());
});

test("rejects a rule whose calculated cutoff already passed", () => {
  const nearEvent = {
    start_date: "2026-09-08T10:30:00-03:00",
    end_date: "2026-09-08T15:00:00-03:00",
  };
  const rule = buildSalesCutoffRule({ preset: "before_start_60" });
  const result = calculateSalesCutoffForEvent(nearEvent, rule, now);

  expect(result.valid).toBe(false);
  expect(result.reason).toContain("já passou");
});
