import appApiClient from "./AppApiClient";
import publicCatalogService from "./PublicCatalogService";

jest.mock("./AppApiClient", () => ({ __esModule: true, default: { get: jest.fn() } }));

beforeEach(() => { jest.clearAllMocks(); });

test("usa catálogo público global em vez de limitar itens a eventos", async () => {
  appApiClient.get.mockResolvedValueOnce({ data: { data: { data: [{ id: 207 }] } } });
  await expect(publicCatalogService.items()).resolves.toEqual([{ id: 207 }]);
  expect(appApiClient.get).toHaveBeenCalledWith("/items", { params: { per_page: 100 } });
});

test("busca nomes das produções em endpoint público e permite ausência de metadados", async () => {
  appApiClient.get.mockResolvedValueOnce({ data: { data: { data: [{ id: 10, name: "Produção" }] } } });
  await expect(publicCatalogService.establishments()).resolves.toEqual([{ id: 10, name: "Produção" }]);
  expect(appApiClient.get).toHaveBeenCalledWith("/establishments", { params: { per_page: 100 } });
});

test("detalhe usa leitura pública e rejeita identificadores inválidos", async () => {
  await expect(publicCatalogService.item("../admin")).rejects.toThrow("Item inválido");
  expect(appApiClient.get).not.toHaveBeenCalled();
  appApiClient.get.mockResolvedValueOnce({ data: { data: { item: { id: 207 } } } });
  await expect(publicCatalogService.item(207)).resolves.toMatchObject({ item: { id: 207 } });
  expect(appApiClient.get).toHaveBeenCalledWith("/catalog-items/207");
});
