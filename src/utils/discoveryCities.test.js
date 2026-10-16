import { availableEventCities, cityIdentity, matchesSelectedCity, withSelectedCity } from "./discoveryCities";

describe("seleção de cidades com eventos", () => {
  test("só oferece cidades com eventos, sem duplicatas e distinguindo UF", () => {
    const cities = availableEventCities([
      { city: "Belo Horizonte", uf: "MG", total: 4 },
      { city: "Belo Horizonte", uf: "MG", total: 4 },
      { city: "São Paulo", uf: "SP", total: 7 },
      { city: "Vila Nova", uf: "GO", total: 0 },
      { city: "", uf: "GO", total: 3 },
      { city: "Belo Horizonte", uf: "SP", total: 2 },
    ]);
    expect(cities).toHaveLength(3);
    expect(cities.map((item) => item.uf)).toEqual(["MG", "SP", "SP"]);
  });
  test("identidade é insensível a acento, mas não confunde estados", () => {
    expect(cityIdentity("São Paulo", "sp")).toBe(cityIdentity("Sao Paulo", "SP"));
    expect(matchesSelectedCity({ city: "São Paulo", uf: "SP" }, { city: "Sao Paulo", uf: "SP" })).toBe(true);
    expect(matchesSelectedCity({ city: "São Paulo", uf: "RJ" }, { city: "São Paulo", uf: "SP" })).toBe(false);
    expect(matchesSelectedCity({}, { city: "São Paulo", uf: "SP" })).toBe(false);
    expect(matchesSelectedCity({}, {})).toBe(true);
  });
  test("insere cidade nos filtros sem sobrescrever período e pesquisa", () => {
    expect(withSelectedCity({ q: "rock", per_page: 12 }, { city: "Goiânia", uf: "GO" }))
      .toEqual({ q: "rock", per_page: 12, city: "Goiânia", uf: "GO" });
  });
});
