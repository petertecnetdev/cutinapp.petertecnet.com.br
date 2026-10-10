import { storageUrl } from "../config";

export const eventInitials = (title, fallback = "EV") => String(title || "")
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join("") || fallback;

export const eventImageUrl = (image) => {
  if (!image) return "";

  const value = String(image).trim();
  if (!value) return "";
  if (/^(?:https?:\/\/|data:image\/|blob:)/i.test(value)) return value;

  // API paths may already include the storage prefix present in storageUrl.
  const relativePath = value.replace(/^\/+/, "").replace(/^storage\/+/i, "");
  return `${storageUrl}${relativePath}`;
};
