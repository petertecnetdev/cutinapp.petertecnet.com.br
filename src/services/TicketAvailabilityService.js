import appApiClient from "./AppApiClient";

const normalizeEventIds = (eventIds = []) => Array.from(new Set(
  eventIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0),
)).slice(0, 50);

const ticketAvailabilityService = {
  forEvents: async (eventIds = []) => {
    const normalized = normalizeEventIds(eventIds);
    if (normalized.length === 0) return {};

    const response = await appApiClient.get("/commerce/ticket-availability", {
      params: { event_ids: normalized },
    });

    return response?.data?.data && typeof response.data.data === "object"
      ? response.data.data
      : {};
  },
};

export default ticketAvailabilityService;
