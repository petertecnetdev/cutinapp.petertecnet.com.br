export const runBestEffort = async (task, onError) => {
  try {
    await task();
    return true;
  } catch (error) {
    try {
      onError?.(error);
    } catch (_) {
      // Error reporting must never turn a secondary task into a blocking failure.
    }
    return false;
  }
};
