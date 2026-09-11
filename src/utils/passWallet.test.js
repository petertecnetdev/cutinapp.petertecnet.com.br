import {
  countdownLabel,
  eventMoment,
  groupPassItems,
  matchesWalletFilter,
  passState,
  sortWalletItems,
  walletCounts,
} from "./passWallet";

const future = "2030-01-02T22:00:00-03:00";
const past = "2029-12-31T22:00:00-03:00";
const now = Date.parse("2030-01-01T12:00:00-03:00");

test("classifies participant pass lifecycle", () => {
  expect(eventMoment({ start_date: future }, now)).toBe("upcoming");
  expect(passState({ event: { start_date: past, end_date: past } }, now).key).toBe("past");
  expect(passState({ status: "refunded", event: { start_date: future } }, now).key).toBe("refunded");
});

test("counts and filters wallet items", () => {
  const items = [
    { kind: "pass", data: { id: 1, event: { start_date: future } } },
    { kind: "transfer", data: { id: 2, event: { start_date: future } } },
    { kind: "pending", data: { id: 3, event: { start_date: future } } },
  ];
  expect(walletCounts(items, now).all).toBe(3);
  expect(items.filter((item) => matchesWalletFilter(item, "upcoming", now))).toHaveLength(1);
  expect(items.filter((item) => matchesWalletFilter(item, "transferred", now))).toHaveLength(1);
  expect(items.filter((item) => matchesWalletFilter(item, "pending", now))).toHaveLength(1);
});

test("groups multiple passes from the same ticket purchase", () => {
  const items = [
    { kind: "pass", data: { id: 1, event: { id: 10 }, ticket: { id: 20 }, purchase: { public_id: "order" } } },
    { kind: "pass", data: { id: 2, event: { id: 10 }, ticket: { id: 20 }, purchase: { public_id: "order" } } },
  ];
  const groups = groupPassItems(items);
  expect(groups).toHaveLength(1);
  expect(groups[0].items).toHaveLength(2);
});

test("sorts future events before old events", () => {
  const items = [
    { kind: "pass", data: { id: 1, event: { start_date: past } } },
    { kind: "pass", data: { id: 2, event: { start_date: future } } },
  ];
  expect(sortWalletItems(items, "nearest", now)[0].data.id).toBe(2);
  expect(countdownLabel({ start_date: "2030-01-02T10:00:00-03:00" }, now)).toBe("Faltam 1 dias");
});
