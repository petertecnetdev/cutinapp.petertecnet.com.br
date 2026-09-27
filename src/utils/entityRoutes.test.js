import {
  publicEventItemRoute,
  publicEventRoute,
  publicProductionRoute,
} from "./entityRoutes";

describe("canonical public entity routes", () => {
  test("links a discovered item directly to its event item detail", () => {
    expect(publicEventItemRoute("festival-noite", 42))
      .toBe("/event/festival-noite/item/42");
  });

  test("encodes dynamic path segments", () => {
    expect(publicEventItemRoute("evento especial", "item/vip"))
      .toBe("/event/evento%20especial/item/item%2Fvip");
  });

  test("falls back to the event catalog when only the event is known", () => {
    expect(publicEventItemRoute("festival-noite", null))
      .toBe("/event/festival-noite/catalogo");
  });

  test("falls back to public event discovery without an event slug", () => {
    expect(publicEventItemRoute("", 42)).toBe("/event");
  });

  test("builds canonical event and production routes", () => {
    expect(publicEventRoute("festival-noite")).toBe("/event/festival-noite");
    expect(publicEventRoute(null)).toBe("/event");
    expect(publicProductionRoute("producao central"))
      .toBe("/production/producao%20central/public");
    expect(publicProductionRoute(undefined)).toBe("/productions");
  });
});
