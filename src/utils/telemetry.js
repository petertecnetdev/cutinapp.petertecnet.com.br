export const trackTelemetry = (type, details = {}) => {
  try {
    if (typeof window === "undefined") return false;
    const tracker = window.PeterTecnetTelemetry?.track;
    if (typeof tracker !== "function") return false;
    tracker(type, details);
    return true;
  } catch (_) {
    return false;
  }
};
