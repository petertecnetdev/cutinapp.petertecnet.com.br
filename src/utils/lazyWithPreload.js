import { lazy } from "react";

const canPreload = () => {
  if (typeof navigator === "undefined") return true;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!connection) return true;
  if (connection.saveData) return false;
  return !["slow-2g", "2g"].includes(connection.effectiveType);
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
