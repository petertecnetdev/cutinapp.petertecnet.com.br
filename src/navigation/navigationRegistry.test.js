import { resolveNavigationCapabilities } from "./capabilityResolver";
import { accountNavigation, actorMenusFor, commonNavigation, contextualNavigation, quickActionsFor, rankQuickActions } from "./navigationRegistry";

const app = (role, roles = []) => ({ slug: "cutinapp", pivot: { status: "active", role, metadata: JSON.stringify({ roles }) } });

describe("capability based navigation", () => {
  test("participant account items stay out of the desktop common navigation", () => {
    expect(commonNavigation.map((entry) => entry.id)).toEqual(["events", "feed", "messages", "productions", "artists"]);
    expect(accountNavigation.map((entry) => entry.id)).toEqual(expect.arrayContaining(["profile", "passes", "purchases", "notifications", "account-settings"]));
  });

  test("roles are cumulative instead of exclusive", () => {
    const capabilities = resolveNavigationCapabilities({ applications: [app("producer", ["artist", "promoter"])] });
    expect(actorMenusFor(capabilities).map((area) => area.id)).toEqual(expect.arrayContaining(["producer", "artist", "promoter"]));
  });

  test("owned production evidence grants producer navigation when legacy membership is missing", () => {
    const capabilities = resolveNavigationCapabilities({ id: 77, applications: [] }, { hasProductions: true });
    expect(capabilities.producer).toBe(true);
    expect(actorMenusFor(capabilities).some((area) => area.id === "producer")).toBe(true);
  });

  test("root keeps every actor area and administration", () => {
    const capabilities = resolveNavigationCapabilities({ email: "petertecnet@gmail.com" });
    expect(actorMenusFor(capabilities).map((area) => area.id)).toEqual(expect.arrayContaining(["producer", "artist", "promoter", "admin"]));
  });

  test("producer menu exposes management revenue tickets and checkin", () => {
    const capabilities = resolveNavigationCapabilities({}, { hasProductions: true });
    const producer = actorMenusFor(capabilities).find((area) => area.id === "producer");
    expect(producer.items.map((entry) => entry.id)).toEqual(expect.arrayContaining(["my-productions", "manage-events", "create-ticket", "sales", "finance", "checkin"]));
  });

  test("context actions appear without changing actor privileges", () => {
    const capabilities = resolveNavigationCapabilities({}, { hasProductions: true });
    expect(contextualNavigation("/production/42", capabilities)?.label).toBe("Produção atual");
    expect(contextualNavigation("/event/88", capabilities)?.items.some((entry) => entry.id === "event-courtesies")).toBe(true);
    expect(contextualNavigation("/event/88", resolveNavigationCapabilities({})) ).toBeNull();
  });

  test("quick actions union all allowed actor areas and can be personalized without moving primary navigation", () => {
    const capabilities = resolveNavigationCapabilities({ applications: [app("producer", ["artist"])] });
    const actions = quickActionsFor(capabilities);
    expect(actions.some((entry) => entry.id === "quick-create-event")).toBe(true);
    expect(actions.some((entry) => entry.id === "quick-artist")).toBe(true);
    expect(rankQuickActions(actions, { "quick-artist": 8 })[0].id).toBe("quick-artist");
    expect(commonNavigation[0].id).toBe("events");
  });
});