import { lazy } from "react";

const canPreload = () => {
  if (typeof navigator === "undefined") return true;

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection?.saveData) return false;
  if (["slow-2g", "2g"].includes(connection?.effectiveType)) return false;

  // Route preloading is only a latency optimization. On constrained phones it
  // competes with the current screen for network, parsing and main-thread time,
  // which is especially noticeable while scrolling. Keep the current route
  // responsive and let navigation load the chunk on demand instead.
  if (Number.isFinite(navigator.deviceMemory) && navigator.deviceMemory <= 4) return false;
  if (Number.isFinite(navigator.hardwareConcurrency) && navigator.hardwareConcurrency <= 4) return false;

  return true;
};

export default function lazyWithPreload(factory) {
  let promise;
  const load = () => {
    if (!promise) promise = factory();
    return promise;
  };
  const Component = lazy(load);
  Component.preload = () => canPreload() ? load() : undefined;
  return Component;
}
