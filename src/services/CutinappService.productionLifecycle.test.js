import appApiClient from "./AppApiClient";
import cutinappService from "./CutinappService";

jest.mock("./AppApiClient", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const productionPayload = (name = "Peter Eventos") => {
  const payload = new FormData();
  payload.append("name", name);
  payload.append("type", "independent");
  return payload;
};

describe("CutinappService production lifecycle idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("updates a production with an idempotency key and preserves the production facade", async () => {
    appApiClient.patch.mockResolvedValueOnce({ data: { organization: { id: 90, name: "Nova Produção" } } });

    const result = await cutinappService.updateProduction("90", productionPayload("Nova Produção"));

    expect(appApiClient.patch).toHaveBeenCalledWith(
      "/organizations/90",
      expect.any(FormData),
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(result.production).toEqual({ id: 90, name: "Nova Produção" });
    expect(result.organization).toBeUndefined();
  });

  test("reuses the update key after an uncertain network failure", async () => {
    appApiClient.patch
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { organization: { id: 91 } } });

    await expect(cutinappService.updateProduction(91, productionPayload())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = appApiClient.patch.mock.calls[0][2].headers["Idempotency-Key"];

    await expect(cutinappService.updateProduction("91", productionPayload())).resolves.toMatchObject({ production: { id: 91 } });
    expect(appApiClient.patch.mock.calls[1][2].headers["Idempotency-Key"]).toBe(firstKey);
  });

  test("deletes a production idempotently and coalesces concurrent deletion", async () => {
    let resolveDelete;
    appApiClient.delete.mockImplementationOnce(() => new Promise((resolve) => { resolveDelete = resolve; }));

    const first = cutinappService.deleteProduction(92);
    const second = cutinappService.deleteProduction("92");

    expect(first).toBe(second);
    expect(appApiClient.delete).toHaveBeenCalledTimes(1);
    expect(appApiClient.delete).toHaveBeenCalledWith(
      "/organizations/92",
      { headers: { "Idempotency-Key": expect.any(String) } },
    );

    resolveDelete({ data: { deleted: true } });
    await expect(first).resolves.toEqual({ deleted: true });
  });

  test("uses a fresh delete key after a definitive validation failure", async () => {
    appApiClient.delete
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { deleted: true } });

    await expect(cutinappService.deleteProduction(93)).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = appApiClient.delete.mock.calls[0][1].headers["Idempotency-Key"];

    await cutinappService.deleteProduction(93);
    const retryKey = appApiClient.delete.mock.calls[1][1].headers["Idempotency-Key"];
    expect(retryKey).toBeTruthy();
    expect(retryKey).not.toBe(rejectedKey);
  });

  test("updates production experience idempotently and isolates payload attempts", async () => {
    appApiClient.patch
      .mockResolvedValueOnce({ data: { experience: { headline: "A" } } })
      .mockResolvedValueOnce({ data: { experience: { headline: "B" } } });

    await cutinappService.updateProductionExperience(94, { headline: "A" });
    await cutinappService.updateProductionExperience(94, { headline: "B" });

    expect(appApiClient.patch).toHaveBeenNthCalledWith(
      1,
      "/organizations/94/experience-profile",
      { headline: "A" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(appApiClient.patch.mock.calls[0][2].headers["Idempotency-Key"]).not.toBe(
      appApiClient.patch.mock.calls[1][2].headers["Idempotency-Key"],
    );
  });
});
