import {
  diceSimilarity,
  findDuplicateCandidate,
  parseMenuDocuments,
  parseMenuText,
} from "./menuOcrParser";

describe("menuOcrParser", () => {
  test("extrai categoria e itens com preço na mesma linha", () => {
    const result = parseMenuText(`BEBIDAS\nCoca Cola 350ml .... R$ 6,00\nHeineken LN .... 12,00`, { confidence: 90 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ name: "Coca Cola 350ml", price: 6, category: "BEBIDAS" });
    expect(result.items[1]).toMatchObject({ name: "Heineken LN", price: 12, category: "BEBIDAS" });
  });

  test("associa preço em linha separada ao nome e descrição", () => {
    const result = parseMenuText(`LANCHES\nX-Bacon\nHambúrguer, bacon e queijo\nR$ 28,00`, { confidence: 88 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      name: "X-Bacon",
      description: "Hambúrguer, bacon e queijo",
      price: 28,
      category: "LANCHES",
    });
  });

  test("transforma P M G em itens separados", () => {
    const result = parseMenuText(`PIZZAS\nPizza Calabresa P 32,00 / M 42,00 / G 55,00`, { confidence: 92 });
    expect(result.items.map((item) => [item.name, item.price])).toEqual([
      ["Pizza Calabresa - P", 32],
      ["Pizza Calabresa - M", 42],
      ["Pizza Calabresa - G", 55],
    ]);
  });

  test("mantém nome pai em variações distribuídas em linhas", () => {
    const result = parseMenuText(`PORÇÕES\nBatata Frita\nPequena .... 15,00\nGrande .... 25,00`, { confidence: 90 });
    expect(result.items.map((item) => [item.name, item.price])).toEqual([
      ["Batata Frita - Pequena", 15],
      ["Batata Frita - Grande", 25],
    ]);
  });

  test("marca duplicado já existente e sugere ignorar", () => {
    const parsed = parseMenuDocuments([
      { name: "menu.jpg", text: "BEBIDAS\nCoca Cola 350ml 6,00", confidence: 95 },
    ], [
      { id: 10, name: "Coca-Cola 350 ml", price: 6, category: "Bebidas", status: true },
    ]);
    expect(parsed.items[0].duplicate).toMatchObject({ id: 10 });
    expect(parsed.items[0].recommended_action).toBe("skip");
  });

  test("normaliza espaçamento de unidades sem confundir produtos diferentes", () => {
    expect(diceSimilarity("Coca Cola 350ml", "Coca-Cola 350 ml")).toBe(1);
    expect(findDuplicateCandidate(
      { name: "Coca Cola 350ml", price: 6 },
      [{ id: 1, name: "Coca-Cola 350 ml", price: 6 }]
    )).not.toBeNull();
    expect(findDuplicateCandidate(
      { name: "Coca Cola 2L", price: 14 },
      [{ id: 1, name: "Coca Cola 350ml", price: 6 }]
    )).toBeNull();
  });
});
