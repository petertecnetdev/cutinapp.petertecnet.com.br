export function evaluateRecoveryRolloutReadiness({ comparison = {} } = {}) {
  const decision = comparison?.decision || {};
  const confidence = comparison?.paid_conversion_difference_confidence_95 || null;
  const projection = comparison?.observed_volume_projection || null;
  const mature = Boolean(comparison?.sample_is_mature);
  const conversionGuardrail = Boolean(decision?.confidence?.paid_conversion_guardrail_satisfied);
  const contributionGuardrail = decision?.guardrails?.platform_contribution_positive === true;
  const eligible = decision?.eligible_for_rollout === true;
  const requiresManualReview = decision?.requires_manual_review !== false;

  let status = "collecting";
  let recommendedAction = "collect_more_data";

  if (mature && decision?.status === "harmful") {
    status = "blocked";
    recommendedAction = "keep_control";
  } else if (mature && decision?.status === "winner" && eligible && conversionGuardrail && contributionGuardrail) {
    status = requiresManualReview ? "ready_for_review" : "ready";
    recommendedAction = requiresManualReview ? "review_rollout" : "rollout_prominent";
  } else if (mature) {
    status = "hold";
    recommendedAction = "keep_control";
  }

  return {
    status,
    recommendedAction,
    mature,
    eligible,
    requiresManualReview,
    guardrails: {
      conversion: conversionGuardrail,
      contribution: contributionGuardrail,
    },
    confidence,
    projection,
  };
}
