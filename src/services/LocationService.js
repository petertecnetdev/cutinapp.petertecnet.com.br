import appApiClient from "./AppApiClient";

const STORAGE_KEY = "cutinapp.homeLocation";

const normalizeCoordinate = (value) => Number(value).toFixed(6);

const locationService = {
  readStored: () => {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    } catch (_) {
      return null;
    }
  },

  saveStored: (location) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
    } catch (_) {
      // Persistência local é apenas uma conveniência.
    }
    return location;
  },

  clearStored: () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      // A descoberta continua funcionando sem persistência local.
    }
  },

  sameCoordinates: (location, lat, lng) => {
    if (!location?.lat || !location?.lng || lat == null || lng == null) return false;
    return Math.abs(Number(location.lat) - Number(lat)) < 0.00001
      && Math.abs(Number(location.lng) - Number(lng)) < 0.00001;
  },

  resolveCoordinates: async (lat, lng) => {
    const normalizedLat = normalizeCoordinate(lat);
    const normalizedLng = normalizeCoordinate(lng);
    try {
      const { data } = await appApiClient.get("/locations/cities", {
        params: { lat: normalizedLat, lng: normalizedLng },
      });
      return {
        ...(data?.location || {}),
        lat: normalizedLat,
        lng: normalizedLng,
        mode: "nearby",
      };
    } catch (_) {
      return {
        label: "Sua localização atual",
        lat: normalizedLat,
        lng: normalizedLng,
        mode: "nearby",
      };
    }
  },

  currentPosition: (options = {}) => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Seu navegador não oferece localização."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: false,
        timeout: 9000,
        maximumAge: 300000,
        ...options,
      }
    );
  }),

  detectCurrent: async (options = {}) => {
    const { coords } = await locationService.currentPosition(options);
    const location = await locationService.resolveCoordinates(coords.latitude, coords.longitude);
    return locationService.saveStored(location);
  },
};

export default locationService;
