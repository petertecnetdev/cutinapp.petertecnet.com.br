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

  generateEventDescription: async ({
    title,
    currentDescription,
    category,
    productionName,
    venue,
    city,
    uf,
    startDate,
    endDate,
    audience,
    tone = "engaging",
  }) => {
    const { data } = await appApiClient.post("/creative/texts", {
      purpose: "event_description",
      subject: title,
      current_description: currentDescription || undefined,
      category: category || undefined,
      production_name: productionName || undefined,
      venue: venue || undefined,
      city: city || undefined,
      uf: uf || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      audience: audience || undefined,
      tone,
    });

    return data;
  },
};

export default creativeService;
