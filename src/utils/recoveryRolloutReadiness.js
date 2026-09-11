export function evaluateRecoveryRolloutReadiness({ comparison = {} } = {}) {
  const rollout = comparison?.rollout_readiness;

  if (!rollout || typeof rollout !== "object") {
    return {
      status: "collecting",
      recommendedAction: "collect_more_data",
      mature: false,
      eligible: false,
      requiresManualReview: true,
      guardrails: { conversion: false, contribution: false },
      confidence: null,
      projection: null,
    };
  }

  return {
    status: rollout.status || "collecting",
    recommendedAction: rollout.recommended_action || "collect_more_data",
    mature: Boolean(rollout.sample_is_mature),
    eligible: rollout.eligible_for_rollout === true,
    requiresManualReview: rollout.requires_manual_review !== false,
    guardrails: {
      conversion: rollout.guardrails?.conversion === true,
      contribution: rollout.guardrails?.contribution === true,
    },
    confidence: rollout.confidence ?? null,
    projection: rollout.projection ?? null,
  };
}
