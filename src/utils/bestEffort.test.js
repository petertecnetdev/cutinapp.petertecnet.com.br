import { runBestEffort } from "./bestEffort";

describe("runBestEffort", () => {
  test("returns true when the secondary task succeeds", async () => {
    const task = jest.fn().mockResolvedValue(undefined);
    await expect(runBestEffort(task)).resolves.toBe(true);
    expect(task).toHaveBeenCalledTimes(1);
  });

  test("returns false and reports the error without rejecting", async () => {
    const error = new Error("secondary sync unavailable");
    const onError = jest.fn();
    await expect(runBestEffort(jest.fn().mockRejectedValue(error), onError)).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith(error);
  });

  test("does not reject when error reporting also fails", async () => {
    await expect(runBestEffort(
      jest.fn().mockRejectedValue(new Error("sync failed")),
      () => { throw new Error("telemetry failed"); }
    )).resolves.toBe(false);
  });
});
