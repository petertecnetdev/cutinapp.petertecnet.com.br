import { appSlug } from "../config";

const parseMetadata = (value) => {
  if (!value) return {};
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
};

export const hasContextRole = (user, role) => {
  const membership = (user?.applications || []).find((application) => application?.slug === appSlug);
  const pivot = membership?.pivot;
  if (!pivot || pivot.status !== "active") return false;
  if (pivot.role === role) return true;
  const metadata = parseMetadata(pivot.metadata);
  return Array.isArray(metadata.roles) && metadata.roles.includes(role);
};
