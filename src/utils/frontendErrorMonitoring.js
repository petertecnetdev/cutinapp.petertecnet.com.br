import { trackTelemetry } from "./telemetry";

const MAX_MESSAGE_LENGTH = 240;

const normalizeMessage = (value) => {
  const message = String(value || "Unexpected frontend error").trim();
  return message.slice(0, MAX_MESSAGE_LENGTH);
};

const currentPath = () => {
  if (typeof window === "undefined") return null;
  return `${window.location.pathname}${window.location.search}`;
};

const report = (source, message, extra = {}) => trackTelemetry("frontend_error", {
  source,
  message: normalizeMessage(message),
  path: currentPath(),
  ...extra,
});

export const installFrontendErrorMonitoring = () => {
  if (typeof window === "undefined" || window.__cutinappFrontendErrorMonitoring) return false;

  const onError = (event) => {
    report("window_error", event?.error?.message || event?.message, {
      filename: event?.filename ? String(event.filename).split("/").pop() : null,
      line: Number(event?.lineno || 0) || null,
      column: Number(event?.colno || 0) || null,
    });
  };

  const onUnhandledRejection = (event) => {
    const reason = event?.reason;
    report("unhandled_rejection", reason?.message || reason);
  };

  const onBoundaryError = (event) => {
    const detail = event?.detail || {};
    report("react_error_boundary", detail.message, {
      component: detail.componentStack
        ? String(detail.componentStack).trim().split("\n")[0].slice(0, MAX_MESSAGE_LENGTH)
        : null,
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  window.addEventListener("petertecnet:ui-error", onBoundaryError);
  window.__cutinappFrontendErrorMonitoring = true;
  return true;
};
