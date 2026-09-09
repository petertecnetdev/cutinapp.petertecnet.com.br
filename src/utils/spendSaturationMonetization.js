import { buildMarginalPerformanceHistoryFromAnalytics } from "./marginalMonetizationBudget";

const normalizedString = (value) => String(value ?? "").trim();
const finitePositive = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const eventIdOf = (row = {}) => normalizedString(
  row.eventId
    ?? row.event_id
    ?? row.eventUuid
    ?? row.event_uuid
    ?? row.event?.id
    ?? row.event?.uuid,
);

const channelOf = (row = {}) => normalizedString(
  row.channel
    ?? row.source
    ?? row.attributionChannel
    ?? row.attribution_channel
    ?? row.campaignType
    ?? row.campaign_type,
).toLowerCase();

const sourceKey = (item = {}, index = 0) => normalizedString(
  item.source ?? item.channel ?? item.name ?? `channel_${index + 1}`,
).toLowerCase();

/**
 * Deriva curvas de saturação por intensidade de gasto a partir de observações
 * realizadas da API central. A divisão é feita por quantis de custo dentro de
 * cada evento/canal, evitando limites monetários arbitrários entre eventos.
 *
 * O resultado é decision support: não executa gastos nem altera preço/taxa.
 */
export function buildEventChannelSpendSaturationCurves(
  rows = [],
  { targetBandCount = 3, minimumObservations = 3 } = {},
) {
  const input = Array.isArray(rows) ? rows : [];
  const requestedBands = Math.max(2, Math.floor(Number(targetBandCount) || 3));
  const minimumRows = Math.max(2, Math.floor(Number(minimumObservations) || 3));
  const grouped = new Map();

  input.forEach((row = {}, index) => {
    const eventId = eventIdOf(row);
    const channel = channelOf(row);
    if (!eventId || !channel) return;

    const normalized = buildMarginalPerformanceHistoryFromAnalytics([{ ...row, period: row.period ?? row.bucket ?? row.window ?? `observation_${index + 1}` }])[0];
    if (!normalized) return;

    const key = `${eventId}::${channel}`;
    if (!grouped.has(key)) grouped.set(key, { eventId, channel, observations: [] });
    grouped.get(key).observations.push({ ...normalized, sourceIndex: index });
  });

  return Array.from(grouped.values()).map((group) => {
    const sorted = [...group.observations].sort((a, b) => (
      a.incrementalCost - b.incrementalCost || a.sourceIndex - b.sourceIndex
    ));

    if (sorted.length < minimumRows) {
      return {
        eventId: group.eventId,
        channel: group.channel,
        observations: sorted.length,
        sufficientEvidence: false,
        reason: "insufficient_spend_intensity_observations",
        bands: [],
      };
    }

    const bandCount = Math.min(requestedBands, sorted.length);
    const buckets = Array.from({ length: bandCount }, () => []);
    sorted.forEach((observation, index) => {
      const bandIndex = Math.min(bandCount - 1, Math.floor((index * bandCount) / sorted.length));
      buckets[bandIndex].push(observation);
    });

    const bands = buckets.map((observations, bandIndex) => {
      const incrementalCost = observations.reduce((sum, item) => sum + item.incrementalCost, 0);
      const incrementalGmv = observations.reduce((sum, item) => sum + item.incrementalGmv, 0);
      const incrementalNetRevenue = observations.reduce((sum, item) => sum + item.incrementalNetRevenue, 0);
      const incrementalContribution = observations.reduce((sum, item) => sum + item.incrementalContribution, 0);
      const costs = observations.map((item) => item.incrementalCost);
      const averageObservedCost = incrementalCost / observations.length;

      return {
        bandIndex,
        intensity: bandIndex === 0 ? "low" : bandIndex === bandCount - 1 ? "high" : "medium",
        observations: observations.length,
        minimumObservedCost: Math.min(...costs),
        maximumObservedCost: Math.max(...costs),
        averageObservedCost,
        incrementalBudgetCapacity: averageObservedCost,
        incrementalCost,
        incrementalGmv,
        incrementalNetRevenue,
        incrementalContribution,
        netReturnOnIncrementalCost: incrementalContribution / incrementalCost,
        observedFromSpendIntensityAnalytics: true,
      };
    });

    const lowReturn = bands[0]?.netReturnOnIncrementalCost ?? 0;
    const highReturn = bands[bands.length - 1]?.netReturnOnIncrementalCost ?? 0;
    const saturationDelta = highReturn - lowReturn;

    return {
      eventId: group.eventId,
      channel: group.channel,
      observations: sorted.length,
      sufficientEvidence: true,
      reason: null,
      bandCount,
      saturationDetected: highReturn < lowReturn,
      saturationDelta,
      lowIntensityNetReturn: lowReturn,
      highIntensityNetReturn: highReturn,
      bands,
    };
  });
}

/**
 * Injeta as curvas observadas como marginalPerformanceHistory, formato já
 * consumido pelo alocador marginal. Preserva qualquer configuração/histórico
 * explicitamente fornecido ao canal.
 */
export function hydrateChannelsWithSpendSaturationHistory({
  eventId,
  channels = [],
  analyticsRows = [],
  targetBandCount = 3,
  minimumObservations = 3,
} = {}) {
  const targetEventId = normalizedString(eventId);
  const curves = buildEventChannelSpendSaturationCurves(analyticsRows, {
    targetBandCount,
    minimumObservations,
  });
  const curvesByChannel = new Map(
    curves
      .filter((curve) => curve.eventId === targetEventId)
      .map((curve) => [curve.channel, curve]),
  );

  return (Array.isArray(channels) ? channels : []).map((channel, index) => {
    const key = sourceKey(channel, index);
    const curve = curvesByChannel.get(key);
    const alreadyConfigured = Array.isArray(channel.marginalReturnBands)
      || Array.isArray(channel.marginalPerformanceHistory)
      || Array.isArray(channel.historicalMarginalPerformance)
      || Array.isArray(channel.realizedAnalyticsHistory)
      || Array.isArray(channel.analyticsHistory);

    if (!curve || alreadyConfigured || !curve.sufficientEvidence) return channel;

    return {
      ...channel,
      marginalPerformanceHistory: curve.bands.map((band) => ({
        incrementalBudgetCapacity: finitePositive(band.incrementalBudgetCapacity),
        incrementalCost: band.incrementalCost,
        incrementalGmv: band.incrementalGmv,
        incrementalNetRevenue: band.incrementalNetRevenue,
        incrementalContribution: band.incrementalContribution,
        netReturnOnIncrementalCost: band.netReturnOnIncrementalCost,
        spendIntensity: band.intensity,
        observedFromSpendIntensityAnalytics: true,
      })),
      spendSaturationCurveSource: "central_analytics_event_channel_spend_intensity",
      spendSaturationDetected: curve.saturationDetected,
      spendSaturationDelta: curve.saturationDelta,
      spendSaturationObservations: curve.observations,
    };
  });
}
