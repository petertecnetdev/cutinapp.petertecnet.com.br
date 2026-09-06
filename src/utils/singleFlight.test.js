import { createKeyedSingleFlight } from "./singleFlight";

describe("createKeyedSingleFlight", () => {
  test("coalesces concurrent work for the same key", async () => {
    const gate = createKeyedSingleFlight();
    let resolveTask;
    const task = jest.fn(() => new Promise((resolve) => { resolveTask = resolve; }));

    const first = gate.run("order-1", task);
    const second = gate.run("order-1", task);

    await Promise.resolve();
    expect(task).toHaveBeenCalledTimes(1);
    resolveTask({ status: "paid" });

    await expect(first).resolves.toEqual({ status: "paid" });
    await expect(second).resolves.toEqual({ status: "paid" });
  });

  test("allows different keys to run independently", async () => {
    const gate = createKeyedSingleFlight();
    const task = jest.fn((value) => Promise.resolve(value));

    await Promise.all([
      gate.run("order-1", () => task("first")),
      gate.run("order-2", () => task("second")),
    ]);

    expect(task).toHaveBeenCalledTimes(2);
  });

  test("releases the key after failures so retries can proceed", async () => {
    const gate = createKeyedSingleFlight();
    const task = jest.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("recovered");

    await expect(gate.run("order-1", task)).rejects.toThrow("network");
    await expect(gate.run("order-1", task)).resolves.toBe("recovered");
    expect(task).toHaveBeenCalledTimes(2);
  });
});
