import { useEffect, useState } from "react";
import { DISCOVERY_CITY_CHANGE_EVENT, readDiscoveryPreference } from "../utils/discoveryFilters";

export default function useDiscoveryCity() {
  const [city, setCity] = useState(readDiscoveryPreference);
  useEffect(() => {
    const sync = () => setCity(readDiscoveryPreference());
    window.addEventListener(DISCOVERY_CITY_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(DISCOVERY_CITY_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return city || {};
}
