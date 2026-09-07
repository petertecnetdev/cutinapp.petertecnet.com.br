import { contextualNavigation, navigationForMode, navigationModesFor } from "./navigationRegistry";

const app = (role, roles = []) => ({ slug: "cutinapp", pivot: { status: "active", role, metadata: JSON.stringify({ roles }) } });

describe("advanced navigation registry", () => {
  test("participant receives only participant mode by default", () => {
    expect(navigationModesFor({ applications: [] }).map((mode) => mode.id)).toEqual(["participant"]);
  });
  test("multi-role user receives manager artist and promoter modes", () => {
    const user = { applications: [app("producer", ["artist", "promoter"])] };
    expect(navigationModesFor(user).map((mode) => mode.id)).toEqual(expect.arrayContaining(["participant", "manager", "artist", "promoter"]));
  });
  test("Peter Tecnet root receives administration without losing actor modes", () => {
    const ids = navigationModesFor({ email: "petertecnet@gmail.com" }).map((mode) => mode.id);
    expect(ids).toEqual(expect.arrayContaining(["participant", "manager", "artist", "promoter", "admin"]));
  });
  test("manager primary navigation prioritizes production events sales and checkin", () => {
    expect(navigationForMode("manager").primary.map((item) => item.id)).toEqual(["manager-home", "events-manage", "sales", "checkin"]);
  });
  test("event and production routes expose contextual management actions", () => {
    expect(contextualNavigation("/event/abc", "manager")?.label).toBe("Evento atual");
    expect(contextualNavigation("/production/42", "admin")?.items.some((item) => item.to === "/production/42/agenda")).toBe(true);
    expect(contextualNavigation("/event/abc", "participant")).toBeNull();
  });
});
