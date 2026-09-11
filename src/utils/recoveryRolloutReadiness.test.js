import { evaluateRecoveryRolloutReadiness } from "./recoveryRolloutReadiness";

describe("evaluateRecoveryRolloutReadiness", () => {
  test("mantém coleta enquanto a amostra não é madura", () => {
    const result = evaluateRecoveryRolloutReadiness({ comparison: { sample_is_mature: false } });
    expect(result.status).toBe("collecting");
    expect(result.recommendedAction).toBe("collect_more_data");
    expect(result.eligible).toBe(false);
  });

  test("bloqueia rollout quando a API detecta dano", () => {
    const result = evaluateRecoveryRolloutReadiness({
      comparison: {
        sample_is_mature: true,
        decision: { status: "harmful", eligible_for_rollout: false, requires_manual_review: true },
      },
    });
    expect(result.status).toBe("blocked");
    expect(result.recommendedAction).toBe("keep_control");
  });

  test("libera somente revisão humana quando todos os guardrails passam", () => {
    const projection = { projected_incremental_paid_orders: 8, projected_incremental_platform_contribution: 120 };
    const result = evaluateRecoveryRolloutReadiness({
      comparison: {
        sample_is_mature: true,
        observed_volume_projection: projection,
        paid_conversion_difference_confidence_95: { lower_paid_orders_per_100_exposed_orders: 0.2, upper_paid_orders_per_100_exposed_orders: 4.1 },
        decision: {
          status: "winner",
          eligible_for_rollout: true,
          requires_manual_review: true,
          confidence: { paid_conversion_guardrail_satisfied: true },
          guardrails: { platform_contribution_positive: true },
        },
      },
    });
    expect(result.status).toBe("ready_for_review");
    expect(result.recommendedAction).toBe("review_rollout");
    expect(result.guardrails).toEqual({ conversion: true, contribution: true });
    expect(result.projection).toBe(projection);
  });

  test("não declara rollout pronto quando um guardrail econômico falha", () => {
    const result = evaluateRecoveryRolloutReadiness({
      comparison: {
        sample_is_mature: true,
        decision: {
          status: "winner",
          eligible_for_rollout: true,
          requires_manual_review: true,
          confidence: { paid_conversion_guardrail_satisfied: true },
          guardrails: { platform_contribution_positive: false },
        },
      },
    });
    expect(result.status).toBe("hold");
    expect(result.recommendedAction).toBe("keep_control");
  });
});
