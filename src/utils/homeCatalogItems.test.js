import { homeCatalogItemRoute, selectHomeCatalogItems } from "./homeCatalogItems";

const item = (id, establishment, extra = {}) => ({
  id, name: `Item ${id}`, entity_name: "establishment", entity_id: establishment, status: true, ...extra,
});

test("mostra itens públicos de produções mesmo sem nenhum evento futuro", () => {
  const list = selectHomeCatalogItems([
    item(1, 10), item(2, 10), item(3, 20), item(4, 10), item(5, 20),
  ], [{ id: 10, name: "Produção A" }, { id: 20, name: "Produção B" }], 4);
  expect(list.map((entry) => entry.id)).toEqual([1, 3, 2, 5]);
  expect(list[1].__production.name).toBe("Produção B");
  expect(list[0].__kind).toBe("catalog");
});

test("não revela itens inativos, arquivados ou sem identificador", () => {
  const list = selectHomeCatalogItems([
    item(1, 10, { status: false }), item(2, 10, { archived_at: "2026-10-01" }),
    item(3, 10, { entity_name: "event" }), item(4, 10), item(4, 10), item(null, 10),
  ], []);
  expect(list.map((entry) => entry.id)).toEqual([4]);
  expect(list[0].__production).toBeNull();
  expect(homeCatalogItemRoute(4)).toBe("/catalogo/item/4");
});
