import { useEffect, useRef } from "react";

const isEnabled = () => {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("cutinapp:render-diagnostics") === "1";
  } catch (_) {
    return false;
  }
};

/**
 * Development-only render counter for high-impact screens.
 * Enable with localStorage.setItem("cutinapp:render-diagnostics", "1").
 * It intentionally has zero production logging/telemetry cost.
 */
export default function useRenderDiagnostics(componentName, warnEvery = 20) {
  const rendersRef = useRef(0);
  const enabledRef = useRef(isEnabled());
  rendersRef.current += 1;

  useEffect(() => {
    if (!enabledRef.current) return;

    const count = rendersRef.current;
    if (count === 1 || count % warnEvery === 0) {
      const method = count >= warnEvery ? "warn" : "debug";
      console[method](`[render] ${componentName}: ${count}`);
    }
  });

  return rendersRef.current;
}
