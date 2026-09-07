import appApiClient from "./AppApiClient";

const eventBulkService = {
  deleteMine: async () => (await appApiClient.delete("/events/mine")).data,
};

export default eventBulkService;
