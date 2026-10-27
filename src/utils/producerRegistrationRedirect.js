// Keep producer acquisition intent when an existing user opens the signup CTA.
export const producerRegistrationRedirect = (location, canProceedToProduction) => {
  if (location?.pathname !== "/register") return null;

  const params = new URLSearchParams(location.search || "");
  const isProducer = location.state?.from === "/production/create"
    || params.get("from") === "/production/create"
    || params.get("role") === "producer";
  if (!isProducer) return null;

  const source = String(location.state?.acquisitionSource || params.get("utm_source") || "").trim();
  return {
    to: canProceedToProduction ? "/production/create" : "/email-verify",
    state: {
      from: "/production/create",
      ...(/^[a-z0-9_-]{1,80}$/i.test(source) ? { acquisitionSource: source } : {}),
    },
  };
};
