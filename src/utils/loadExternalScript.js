const DEFAULT_TIMEOUT_MS = 15000;

const normalizeError = (message) => new Error(message || "Não foi possível carregar o recurso externo.");

export const loadExternalScript = ({
  src,
  selector,
  isReady,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  attributes = {},
  errorMessage,
} = {}) => new Promise((resolve, reject) => {
  if (!src || typeof isReady !== "function") {
    reject(new TypeError("loadExternalScript requires src and isReady"));
    return;
  }

  const readyValue = isReady();
  if (readyValue) {
    resolve(readyValue);
    return;
  }

  const query = selector || `script[src="${src}"]`;
  let script = document.querySelector(query);

  if (script?.dataset?.externalLoadState === "failed" || script?.dataset?.externalLoadState === "loaded") {
    script.remove();
    script = null;
  }

  let settled = false;
  let timer = null;

  const cleanup = () => {
    if (timer) window.clearTimeout(timer);
    script?.removeEventListener("load", handleLoad);
    script?.removeEventListener("error", handleError);
  };

  const fail = () => {
    if (settled) return;
    settled = true;
    cleanup();
    if (script) {
      script.dataset.externalLoadState = "failed";
      script.remove();
    }
    reject(normalizeError(errorMessage));
  };

  const handleLoad = () => {
    if (settled) return;
    const value = isReady();
    if (!value) {
      fail();
      return;
    }
    settled = true;
    if (script) script.dataset.externalLoadState = "loaded";
    cleanup();
    resolve(value);
  };

  const handleError = () => fail();

  if (!script) {
    script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.externalLoadState = "loading";
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined && value !== null) script.setAttribute(key, String(value));
    });
    document.head.appendChild(script);
  }

  script.addEventListener("load", handleLoad, { once: true });
  script.addEventListener("error", handleError, { once: true });
  timer = window.setTimeout(fail, Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
});

export default loadExternalScript;
