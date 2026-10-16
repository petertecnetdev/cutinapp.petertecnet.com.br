import { filterAvailableEventCities, groupCitiesByState, normalizeAvailableEventCities } from "./cityDirectory";

const data = { cities: [
  { city: "Goiânia", uf: "GO", slug: "goiania-go", city_id: 5208707, total: 9 },
  { city: "Belo Horizonte", uf: "MG", slug: "belo-horizonte-mg", city_id: 3106200, total: 3 },
  { city: "Goiania", uf: "GO", total: 8 },
  { city: "Sem evento", uf: "SP", slug: "sem-evento-sp", total: 0 },
  { city: "Oculta", uf: "RJ", total: -1 },
  { city: "", uf: "BA", total: 8 },
] };

test("exibe apenas cidades com eventos, sem duplicatas e com links canônicos", () => {
  const cities = normalizeAvailableEventCities(data);
  expect(cities).toHaveLength(2);
  expect(cities[0]).toMatchObject({ city: "Goiânia", total: 9, slug: "goiania-go" });
  expect(cities[1].slug).toBe("belo-horizonte-mg");
});

test("busca cidades sem diferenciar acentos ou maiúsculas e agrupa por UF", () => {
  const cities = normalizeAvailableEventCities(data);
  expect(filterAvailableEventCities(cities, "GOIANIA")).toHaveLength(1);
  expect(filterAvailableEventCities(cities, "mg")).toHaveLength(1);
  expect(groupCitiesByState(cities).map((group) => group.uf)).toEqual(["GO", "MG"]);
});

test("ignora slugs inseguros e usa um caminho local quando o slug for inválido", () => {
  expect(normalizeAvailableEventCities({ cities: [
    { city: "São José", uf: "SC", total: 1, slug: "//outro.site/invalido" },
  ] })[0].slug).toBe("sao-jose-sc");
});
