import { buildBreadcrumbs, contextualQuickActions, pushRecent, searchNavigation, toggleFavorite } from "./navigationEnhancements";

describe("advanced navigation intelligence", () => {
  test("builds production breadcrumbs with entity name", () => {
    expect(buildBreadcrumbs("/production/42/agenda", [{ id: 42, name: "LaFyesta" }]).map((x) => x.label)).toEqual(["Cutinapp", "Produções", "LaFyesta"]);
  });
  test("event context gives producer revenue and operation actions", () => {
    expect(contextualQuickActions("/event/88", { producer: true }).map((x) => x.id)).toEqual(expect.arrayContaining(["context-event-ticket", "context-event-courtesy", "context-event-checkin"]));
  });
  test("participant never receives producer contextual actions", () => expect(contextualQuickActions("/event/88", { producer: false })).toEqual([]));
  test("search is accent and case friendly enough for labels", () => expect(searchNavigation([{ id: "sales", label: "Vendas", to: "/sales" }], "VEN")[0].id).toBe("sales"));
  test("recents are stable and de-duplicated", () => expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]));
  test("favorites toggle without duplicates", () => expect(toggleFavorite(toggleFavorite([], "sales"), "sales")).toEqual([]));
});
