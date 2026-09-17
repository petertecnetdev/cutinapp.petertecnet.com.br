const DEFAULTS = {
  windowSize: 10,
  minimumSamples: 5,
  minimumZeroResults: 3,
  baselineRate: 0.35,
  spikeDelta: 0.25,
};

const normalizeOutcome = (value) => Boolean(value);

export const detectSearchZeroResultAnomaly = (outcomes = [], options = {}) => {
  const config = { ...DEFAULTS, ...options };
  const windowSize = Math.max(1, Number(config.windowSize) || DEFAULTS.windowSize);
  const minimumSamples = Math.max(1, Number(config.minimumSamples) || DEFAULTS.minimumSamples);
  const minimumZeroResults = Math.max(1, Number(config.minimumZeroResults) || DEFAULTS.minimumZeroResults);
  const baselineRate = Math.min(1, Math.max(0, Number(config.baselineRate) || 0));
  const spikeDelta = Math.max(0, Number(config.spikeDelta) || 0);
  const window = outcomes.slice(-windowSize).map(normalizeOutcome);
  const sampleCount = window.length;
  const zeroResultCount = window.filter(Boolean).length;
  const zeroResultRate = sampleCount ? zeroResultCount / sampleCount : 0;
  const rateThreshold = baselineRate + spikeDelta;

  const anomalous = sampleCount >= minimumSamples
    && zeroResultCount >= minimumZeroResults
    && zeroResultRate >= rateThreshold;

  return {
    anomalous,
    sampleCount,
    zeroResultCount,
    zeroResultRate,
    threshold: rateThreshold,
    reason: anomalous ? "search_zero_result_rate_spike" : null,
  };
};

export const appendSearchOutcome = (outcomes = [], zeroResult, windowSize = DEFAULTS.windowSize) => {
  const next = [...outcomes, normalizeOutcome(zeroResult)];
  return next.slice(-Math.max(1, Number(windowSize) || DEFAULTS.windowSize));
};
