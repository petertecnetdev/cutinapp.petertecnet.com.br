import appApiClient from "./AppApiClient";

const producerMediaLibraryService = {
  list: async (params = {}) => (await appApiClient.get("/event-media", { params })).data.media,
  show: async (eventId) => (await appApiClient.get(`/event-media/${Number(eventId)}`)).data.media,
  download: async (eventId) => (await appApiClient.get(`/event-media/${Number(eventId)}/download`, {
    responseType: "blob",
  })).data,
  downloadItem: async (item) => {
    const path = String(item?.download_path || "").trim();
    if (!path) return producerMediaLibraryService.download(item?.event_id);
    return (await appApiClient.get(path, { responseType: "blob" })).data;
  },
};

export default producerMediaLibraryService;
