import { evaluateRecoveryRolloutReadiness } from "./recoveryRolloutReadiness";

describe("evaluateRecoveryRolloutReadiness", () => {
  test("mantém estado seguro enquanto a API ainda não envia rollout_readiness", () => {
    const result = evaluateRecoveryRolloutReadiness({ comparison: { sample_is_mature: true, decision: { status: "winner" } } });
    expect(result.status).toBe("collecting");
    expect(result.recommendedAction).toBe("collect_more_data");
    expect(result.eligible).toBe(false);
  });

  test("renderiza diretamente a prontidão decidida pela API central", () => {
    const confidence = { lower_paid_orders_per_100_exposed_orders: 0.2, upper_paid_orders_per_100_exposed_orders: 4.1 };
    const projection = { projected_incremental_paid_orders: 8, projected_incremental_platform_contribution: 120 };
    const result = evaluateRecoveryRolloutReadiness({
      comparison: {
        rollout_readiness: {
          status: "ready_for_review",
          recommended_action: "review_rollout",
          sample_is_mature: true,
          eligible_for_rollout: true,
          requires_manual_review: true,
          guardrails: { conversion: true, contribution: true },
          confidence,
          projection,
        },
      },
    });

    expect(result).toEqual({
      status: "ready_for_review",
      recommendedAction: "review_rollout",
      mature: true,
      eligible: true,
      requiresManualReview: true,
      guardrails: { conversion: true, contribution: true },
      confidence,
      projection,
    });
  });

  test("não tenta reinterpretar decisão econômica antiga do frontend", () => {
    const result = evaluateRecoveryRolloutReadiness({
      comparison: {
        sample_is_mature: true,
        decision: {
          status: "winner",
          eligible_for_rollout: true,
          confidence: { paid_conversion_guardrail_satisfied: true },
          guardrails: { platform_contribution_positive: true },
        },
        rollout_readiness: {
          status: "hold",
          recommended_action: "keep_control",
          sample_is_mature: true,
          eligible_for_rollout: false,
          requires_manual_review: true,
          guardrails: { conversion: true, contribution: false },
        },
      },
    });

    expect(result.status).toBe("hold");
    expect(result.recommendedAction).toBe("keep_control");
    expect(result.eligible).toBe(false);
    expect(result.guardrails).toEqual({ conversion: true, contribution: false });
  });
});
