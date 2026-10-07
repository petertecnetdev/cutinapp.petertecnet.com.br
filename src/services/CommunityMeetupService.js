import appApiClient from "./AppApiClient";
import eventService from "./EventService";

const communityMeetupService = {
  create: async (formData) => {
    const created = await eventService.store(formData);
    const event = created?.event;
    if (!event?.id) throw new Error("A API não retornou o encontro criado.");

    const published = await appApiClient.post(`/events/${Number(event.id)}/publish`);
    return published.data?.event || event;
  },

  update: async (eventId, formData) => {
    const response = await eventService.update(eventId, formData);
    return response?.event || response;
  },

  publicAttendance: async (slug) => (
    await appApiClient.get(`/events/public/${encodeURIComponent(slug)}/attendance`)
  ).data,

  attendance: async (eventId) => (
    await appApiClient.get(`/events/${Number(eventId)}/attendance`)
  ).data,

  setAttendance: async (eventId, status) => (
    await appApiClient.put(`/events/${Number(eventId)}/attendance`, { status })
  ).data,

  selfCheckin: async (eventId, latitude, longitude) => (
    await appApiClient.post(`/events/${Number(eventId)}/attendance/checkin`, { latitude, longitude })
  ).data,

  manageAttendance: async (eventId) => (
    await appApiClient.get(`/events/${Number(eventId)}/attendance/manage`)
  ).data,

  organizerCheckin: async (eventId, userId) => (
    await appApiClient.post(`/events/${Number(eventId)}/attendance/${Number(userId)}/checkin`)
  ).data,
};

export default communityMeetupService;
