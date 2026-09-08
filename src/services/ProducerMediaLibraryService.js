import appApiClient from "./AppApiClient";

const producerMediaLibraryService = {
  list: async (params = {}) => (await appApiClient.get("/event-media", { params })).data.media,
  show: async (eventId) => (await appApiClient.get(`/event-media/${Number(eventId)}`)).data.media,
  download: async (eventId) => (await appApiClient.get(`/event-media/${Number(eventId)}/download`, {
    responseType: "blob",
  })).data,
};

export default producerMediaLibraryService;
