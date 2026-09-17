import { appendSearchOutcome, detectSearchZeroResultAnomaly } from "./searchZeroResultAnomaly";

describe("search zero-result anomaly detector", () => {
  test("does not alert before the minimum sample size", () => {
    expect(detectSearchZeroResultAnomaly([true, true, true, true])).toMatchObject({
      anomalous: false,
      sampleCount: 4,
      zeroResultCount: 4,
    });
  });

  test("alerts on a deterministic zero-result spike", () => {
    expect(detectSearchZeroResultAnomaly([false, true, true, true, false])).toMatchObject({
      anomalous: true,
      sampleCount: 5,
      zeroResultCount: 3,
      reason: "search_zero_result_rate_spike",
    });
  });

  test("does not alert when the rate is below the configured threshold", () => {
    expect(detectSearchZeroResultAnomaly([false, false, true, false, false], {
      baselineRate: 0.35,
      spikeDelta: 0.25,
    })).toMatchObject({
      anomalous: false,
      zeroResultCount: 1,
    });
  });

  test("keeps only the bounded recent window", () => {
    expect(appendSearchOutcome([false, false, false], true, 3)).toEqual([false, false, true]);
  });

  test("handles empty input without false positives", () => {
    expect(detectSearchZeroResultAnomaly()).toMatchObject({
      anomalous: false,
      sampleCount: 0,
      zeroResultCount: 0,
      reason: null,
    });
  });
});
