/* W4 attribution quality gate — CYCLE_ID=20261007-mobile-nav-runtime-validation.
 * This test deliberately fails until the W2 attribution-source bug is fixed.
 * No producer conversion is credited to a CTA placement without a real source.
 */
import {
  captureProducerCampaign,
  resolveProducerCampaign,
  producerCampaignMetadata,
} from "./producerCampaignAttribution";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("producer acquisition source integrity", () => {
  test("legacy landing placement is not fabricated as acquisition source", () => {
    const result = resolveProducerCampaign({
      state: { acquisitionSource: "producer_landing_hero" },
      search: "",
    });

    expect(result.acquisitionSource).toBeNull();
    expect(result.acquisitionPlacement).toBe("producer_landing_hero");
    expect(producerCampaignMetadata(result).acquisition_source).toBeNull();
  });

  test("explicit placement without campaign remains placement-only", () => {
    const result = resolveProducerCampaign({
      state: { acquisitionPlacement: "producer_landing_nav" },
      search: "",
    });

    expect(result.acquisitionSource).toBeNull();
    expect(result.acquisitionPlacement).toBe("producer_landing_nav");
  });

  test("Instagram UTM remains source and does not overwrite CTA placement", () => {
    const result = resolveProducerCampaign({
      state: { acquisitionSource: "producer_landing_hero" },
      search: "?utm_source=instagram&utm_medium=social&utm_campaign=producer_activation",
    });

    expect(result.acquisitionSource).toBe("instagram");
    expect(result.acquisitionPlacement).toBe("producer_landing_hero");
    expect(result.utm_medium).toBe("social");
    expect(result.utm_campaign).toBe("producer_activation");
  });

  test("captured Instagram attribution survives a subsequent landing navigation", () => {
    captureProducerCampaign("?utm_source=instagram&utm_medium=story&utm_campaign=producers");
    const result = resolveProducerCampaign({
      state: { acquisitionPlacement: "producer_landing_bottom" },
      search: "",
    });

    expect(result.acquisitionSource).toBe("instagram");
    expect(result.acquisitionPlacement).toBe("producer_landing_bottom");
    expect(result.utm_campaign).toBe("producers");
  });
});
