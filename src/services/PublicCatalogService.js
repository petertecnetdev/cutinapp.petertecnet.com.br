import appApiClient from "./AppApiClient";

// O catálogo genérico é público e independente da agenda de eventos.
const publicCatalogService = {
  items: async (perPage = 100) => {
    const response = await appApiClient.get("/items", { params: { per_page: perPage } });
    return Array.isArray(response.data?.data?.data) ? response.data.data.data : [];
  },
  establishments: async (perPage = 100) => {
    const response = await appApiClient.get("/establishments", { params: { per_page: perPage } });
    return Array.isArray(response.data?.data?.data) ? response.data.data.data : [];
  },
  item: async (itemId) => {
    const id = Number(itemId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Item inválido.");
    const response = await appApiClient.get(`/catalog-items/${id}`);
    return response.data?.data || response.data;
  },
};

export default publicCatalogService;
