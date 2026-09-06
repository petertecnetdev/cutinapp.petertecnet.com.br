export const createKeyedSingleFlight = () => {
  const inFlight = new Map();

  return {
    run(key, task) {
      if (!key || typeof task !== "function") {
        return Promise.reject(new TypeError("single-flight requires a key and task"));
      }

      if (inFlight.has(key)) return inFlight.get(key);

      const promise = Promise.resolve()
        .then(task)
        .finally(() => {
          if (inFlight.get(key) === promise) inFlight.delete(key);
        });

      inFlight.set(key, promise);
      return promise;
    },
  };
};
