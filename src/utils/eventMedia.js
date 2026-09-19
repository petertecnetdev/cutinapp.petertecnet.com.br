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

  return `${storageUrl}${value.replace(/^\/+/, "")}`;
};
