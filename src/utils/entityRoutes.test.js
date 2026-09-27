import {
  publicArtistRoute,
  publicEventItemRoute,
  publicEventRoute,
  publicProductionRoute,
  safeInternalRoute,
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

  test("builds canonical event, artist and production routes", () => {
    expect(publicEventRoute("festival-noite")).toBe("/event/festival-noite");
    expect(publicEventRoute(null)).toBe("/event");
    expect(publicArtistRoute("banda/noite")).toBe("/artist/banda%2Fnoite");
    expect(publicArtistRoute("")).toBe("/artists");
    expect(publicProductionRoute("producao central"))
      .toBe("/production/producao%20central/public");
    expect(publicProductionRoute(undefined)).toBe("/productions");
  });

  test("preserves safe internal search destinations", () => {
    expect(safeInternalRoute("/artist/dj-noite?from=search"))
      .toBe("/artist/dj-noite?from=search");
  });

  test("falls back when a search destination is missing or external", () => {
    expect(safeInternalRoute(undefined)).toBe("/search");
    expect(safeInternalRoute("https://example.com/event")).toBe("/search");
    expect(safeInternalRoute("//example.com/event")).toBe("/search");
    expect(safeInternalRoute("/\\example.com/event")).toBe("/search");
  });

  test("does not accept an unsafe fallback", () => {
    expect(safeInternalRoute("", "https://example.com")).toBe("/");
  });
});
