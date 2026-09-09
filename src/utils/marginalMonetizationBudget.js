import { recommendRiskAdjustedMonetizationBudgetAllocation } from "./riskAdjustedMonetizationBudget";

const finiteNonNegative = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const finite = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sourceKey = (item = {}, index = 0) => (
  String(item.source || item.channel || item.name || `channel_${index + 1}`).trim().toLowerCase()
);

const normalizedString = (value) => String(value ?? "").trim();

const analyticsEventId = (row = {}) => normalizedString(
  row.eventId
    ?? row.event_id
    ?? row.eventUuid
    ?? row.event_uuid
    ?? row.event?.id
    ?? row.event?.uuid,
);

const analyticsChannel = (row = {}) => normalizedString(
  row.channel
    ?? row.source
    ?? row.attributionChannel
    ?? row.attribution_channel
    ?? row.campaignType
    ?? row.campaign_type,
).toLowerCase();

const analyticsPeriod = (row = {}, index = 0) => normalizedString(
  row.period
    ?? row.bucket
    ?? row.window
    ?? row.windowStart
    ?? row.window_start
    ?? row.date,
) || `period_${index + 1}`;

export function buildMarginalPerformanceHistoryFromAnalytics(rows = []) {
  const input = Array.isArray(rows) ? rows : [];

  return input
    .map((row = {}, historyIndex) => {
      const incrementalCost = finiteNonNegative(
        row.incrementalCost
          ?? row.incremental_cost
          ?? row.cost
          ?? row.spend
          ?? row.attributedCost
          ?? row.attributed_cost,
      );
      const incrementalGmv = finiteNonNegative(
        row.incrementalGmv
          ?? row.incremental_gmv
          ?? row.gmv
          ?? row.grossMerchandiseValue
          ?? row.gross_merchandise_value,
      );
      const incrementalNetRevenue = finiteNonNegative(
        row.incrementalNetRevenue
          ?? row.incremental_net_revenue
          ?? row.netRevenue
          ?? row.net_revenue
          ?? row.platformNetRevenue
          ?? row.platform_net_revenue,
      );

      const explicitContribution = Number(
        row.incrementalContribution
          ?? row.incremental_contribution
          ?? row.contribution
          ?? row.netContribution
          ?? row.net_contribution,
      );
      const contribution = Number.isFinite(explicitContribution)
        ? explicitContribution
        : incrementalNetRevenue - incrementalCost;

      if (incrementalCost <= 0 || !Number.isFinite(contribution)) return null;

      return {
        historyIndex,
        period: row.period ?? row.bucket ?? row.window ?? null,
        incrementalBudgetCapacity: incrementalCost,
        incrementalCost,
        incrementalGmv,
        incrementalNetRevenue,
        incrementalContribution: contribution,
        netReturnOnIncrementalCost: contribution / incrementalCost,
        observedFromAnalytics: true,
      };
    })
    .filter(Boolean);
}

export function buildEventChannelMarginalPerformanceHistories(rows = []) {
  const input = Array.isArray(rows) ? rows : [];
  const grouped = new Map();

  input.forEach((row = {}, index) => {
    const eventId = analyticsEventId(row);
    const channel = analyticsChannel(row);
    if (!eventId || !channel) return;

    const period = analyticsPeriod(row, index);
    const normalized = buildMarginalPerformanceHistoryFromAnalytics([{ ...row, period }])[0];
    if (!normalized) return;

    const groupKey = `${eventId}::${channel}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        eventId,
        channel,
        periods: new Map(),
      });
    }

    const group = grouped.get(groupKey);
    const current = group.periods.get(period) || {
      period,
      incrementalCost: 0,
      incrementalGmv: 0,
      incrementalNetRevenue: 0,
      incrementalContribution: 0,
      rowCount: 0,
    };

    current.incrementalCost += normalized.incrementalCost;
    current.incrementalGmv += normalized.incrementalGmv;
    current.incrementalNetRevenue += normalized.incrementalNetRevenue;
    current.incrementalContribution += normalized.incrementalContribution;
    current.rowCount += 1;
    group.periods.set(period, current);
  });

  return Array.from(grouped.values()).map((group) => {
    const history = Array.from(group.periods.values()).map((period, historyIndex) => ({
      historyIndex,
      period: period.period,
      incrementalBudgetCapacity: period.incrementalCost,
      incrementalCost: period.incrementalCost,
      incrementalGmv: period.incrementalGmv,
      incrementalNetRevenue: period.incrementalNetRevenue,
      incrementalContribution: period.incrementalContribution,
      netReturnOnIncrementalCost: period.incrementalContribution / period.incrementalCost,
      observedFromAnalytics: true,
      aggregatedAnalyticsRows: period.rowCount,
    }));

    return {
      eventId: group.eventId,
      channel: group.channel,
      history,
      periods: history.length,
      totalIncrementalCost: history.reduce((sum, item) => sum + item.incrementalCost, 0),
      totalIncrementalGmv: history.reduce((sum, item) => sum + item.incrementalGmv, 0),
      totalIncrementalNetRevenue: history.reduce((sum, item) => sum + item.incrementalNetRevenue, 0),
      totalIncrementalContribution: history.reduce((sum, item) => sum + item.incrementalContribution, 0),
    };
  });
}

export function hydrateChannelsWithRealizedAnalyticsHistory({
  eventId,
  channels = [],
  analyticsRows = [],
} = {}) {
  const targetEventId = normalizedString(eventId);
  const histories = buildEventChannelMarginalPerformanceHistories(analyticsRows);
  const historyByChannel = new Map(
    histories
      .filter((group) => group.eventId === targetEventId)
      .map((group) => [group.channel, group.history]),
  );

  return (Array.isArray(channels) ? channels : []).map((channel, index) => {
    const key = sourceKey(channel, index);
    const alreadyHasHistory = Array.isArray(channel.marginalPerformanceHistory)
      || Array.isArray(channel.historicalMarginalPerformance)
      || Array.isArray(channel.realizedAnalyticsHistory)
      || Array.isArray(channel.analyticsHistory);

    if (alreadyHasHistory || !historyByChannel.has(key)) return channel;

    return {
      ...channel,
      realizedAnalyticsHistory: historyByChannel.get(key),
      realizedAnalyticsHistorySource: "central_analytics_event_channel",
    };
  });
}

const deriveHistoricalBands = (original = {}, channel = {}) => {
  const rawHistory = Array.isArray(original.marginalPerformanceHistory)
    ? original.marginalPerformanceHistory
    : Array.isArray(original.historicalMarginalPerformance)
      ? original.historicalMarginalPerformance
      : Array.isArray(original.realizedAnalyticsHistory)
        ? buildMarginalPerformanceHistoryFromAnalytics(original.realizedAnalyticsHistory)
        : Array.isArray(original.analyticsHistory)
          ? buildMarginalPerformanceHistoryFromAnalytics(original.analyticsHistory)
          : [];

  const totalRiskPenalty = finiteNonNegative(channel.volatilityPenalty)
    + finiteNonNegative(channel.decliningTrendPenalty);

  return rawHistory
    .map((observation = {}, historyIndex) => {
      const capacity = finiteNonNegative(
        observation.incrementalBudgetCapacity
          ?? observation.incrementalBudget
          ?? observation.incrementalCost
          ?? observation.cost,
      );
      const rawReturn = Number(
        observation.marginalNetReturnOnIncrementalCost
          ?? observation.netReturnOnIncrementalCost
          ?? observation.marginalReturn,
      );

      if (capacity <= 0 || !Number.isFinite(rawReturn)) return null;

      return {
        historyIndex,
        capacity,
        rawReturn,
        marginalRiskAdjustedNetReturn: rawReturn - totalRiskPenalty,
        incrementalGmv: finiteNonNegative(observation.incrementalGmv),
        incrementalNetRevenue: finiteNonNegative(observation.incrementalNetRevenue),
        incrementalContribution: Number.isFinite(Number(observation.incrementalContribution))
          ? Number(observation.incrementalContribution)
          : null,
        observedFromAnalytics: observation.observedFromAnalytics === true,
        period: observation.period ?? null,
      };
    })
    .filter(Boolean);
};

export function recommendMarginalMonetizationBudgetAllocation({
  channels = [],
  availableIncrementalBudget = 0,
  ...guardrails
} = {}) {
  const budget = finiteNonNegative(availableIncrementalBudget);
  const inputChannels = Array.isArray(channels) ? channels : [];
  const channelBySource = new Map(
    inputChannels.map((item, index) => [sourceKey(item, index), item]),
  );

  const normalized = recommendRiskAdjustedMonetizationBudgetAllocation({
    channels: inputChannels,
    availableIncrementalBudget: 0,
    ...guardrails,
  });

  const tranches = [];

  normalized.recommendations.forEach((channel) => {
    if (!channel.eligibleForPaidBudget || channel.riskAdjustedNetReturn <= 0) return;

    const original = channelBySource.get(channel.source) || {};
    const explicitBands = Array.isArray(original.marginalReturnBands)
      ? original.marginalReturnBands
      : [];
    const historicalBands = explicitBands.length === 0
      ? deriveHistoricalBands(original, channel)
      : [];
    const effectiveBands = explicitBands.length > 0 ? explicitBands : historicalBands;
    const bandsSource = explicitBands.length > 0
      ? "explicit"
      : historicalBands.length > 0
        ? historicalBands.some((band) => band.observedFromAnalytics)
          ? "central_analytics"
          : "observed_history"
        : "observed_channel_return";
    const maximumChannelBudget = finiteNonNegative(channel.scalableSafeHeadroom);
    let remainingChannelCapacity = maximumChannelBudget;

    if (effectiveBands.length === 0) {
      tranches.push({
        source: channel.source,
        bandIndex: 0,
        capacity: maximumChannelBudget,
        marginalRiskAdjustedNetReturn: channel.riskAdjustedNetReturn,
        baseRiskAdjustedNetReturn: channel.riskAdjustedNetReturn,
        modeledFromObservedReturn: true,
        bandsSource,
      });
      return;
    }

    effectiveBands.forEach((band = {}, bandIndex) => {
      if (remainingChannelCapacity <= 0) return;
      const requestedCapacity = finiteNonNegative(
        band.incrementalBudgetCapacity ?? band.budgetCapacity ?? band.capacity,
      );
      const capacity = Math.min(remainingChannelCapacity, requestedCapacity);
      if (capacity <= 0) return;

      const directReturn = Number(
        band.marginalRiskAdjustedNetReturn
          ?? band.riskAdjustedNetReturn
          ?? band.netReturnOnIncrementalCost,
      );
      const multiplier = finite(band.returnMultiplier, 1);
      const marginalRiskAdjustedNetReturn = Number.isFinite(directReturn)
        ? directReturn
        : channel.riskAdjustedNetReturn * Math.max(0, multiplier);

      tranches.push({
        source: channel.source,
        bandIndex,
        capacity,
        marginalRiskAdjustedNetReturn,
        baseRiskAdjustedNetReturn: channel.riskAdjustedNetReturn,
        modeledFromObservedReturn: !Number.isFinite(directReturn),
        bandsSource,
        historyIndex: Number.isInteger(band.historyIndex) ? band.historyIndex : null,
        rawHistoricalNetReturn: Number.isFinite(band.rawReturn) ? band.rawReturn : null,
        incrementalGmv: finiteNonNegative(band.incrementalGmv),
        incrementalNetRevenue: finiteNonNegative(band.incrementalNetRevenue),
        incrementalContribution: Number.isFinite(Number(band.incrementalContribution))
          ? Number(band.incrementalContribution)
          : null,
        period: band.period ?? null,
      });
      remainingChannelCapacity -= capacity;
    });
  });

  tranches.sort((a, b) => {
    if (b.marginalRiskAdjustedNetReturn !== a.marginalRiskAdjustedNetReturn) {
      return b.marginalRiskAdjustedNetReturn - a.marginalRiskAdjustedNetReturn;
    }
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.bandIndex - b.bandIndex;
  });

  let remainingBudget = budget;
  const allocationBySource = {};
  const allocatedTranches = tranches.map((tranche) => {
    const allocatedBudget = tranche.marginalRiskAdjustedNetReturn > 0
      ? Math.min(remainingBudget, tranche.capacity)
      : 0;
    if (allocatedBudget > 0) {
      allocationBySource[tranche.source] = (allocationBySource[tranche.source] || 0) + allocatedBudget;
      remainingBudget -= allocatedBudget;
    }
    return { ...tranche, allocatedBudget };
  });

  const recommendations = normalized.recommendations.map((channel) => {
    const channelTranches = allocatedTranches.filter((tranche) => tranche.source === channel.source);
    return {
      ...channel,
      suggestedIncrementalBudget: allocationBySource[channel.source] || 0,
      marginalBandsSource: channelTranches[0]?.bandsSource || "unavailable",
      marginalBandsEvaluated: channelTranches.length,
    };
  });

  return {
    ...normalized,
    decisionSupportOnly: true,
    allocationMethod: "marginal_risk_adjusted_net_return",
    availableIncrementalBudget: budget,
    allocatedBudget: budget - remainingBudget,
    unallocatedBudget: remainingBudget,
    allocationBySource,
    marginalReturnTranches: allocatedTranches,
    recommendations,
  };
}
