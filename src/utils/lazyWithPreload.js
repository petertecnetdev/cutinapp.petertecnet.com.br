import { lazy } from "react";

export default function lazyWithPreload(factory) {
  let promise;
  const load = () => {
    if (!promise) promise = factory();
    return promise;
  };
  const Component = lazy(load);
  Component.preload = load;
  return Component;
}
