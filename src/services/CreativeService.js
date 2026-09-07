import appApiClient from "./AppApiClient";

const creativeService = {
  generateEventFlyerBackground: async ({
    title,
    description,
    style,
    productionName,
    venue,
    city,
    uf,
    format,
  }) => {
    const { data } = await appApiClient.post("/creative/images", {
      purpose: "event_flyer_background",
      subject: title,
      description: description || undefined,
      style,
      production_name: productionName || undefined,
      venue: venue || undefined,
      city: city || undefined,
      uf: uf || undefined,
      format,
    });

    return data;
  },
};

export default creativeService;
