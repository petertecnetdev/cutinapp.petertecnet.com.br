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

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("CutinappService production creation idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("sends an idempotency key and keeps the production facade response", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { organization: { id: 10, name: "Peter Eventos" } } });

    const result = await cutinappService.createProduction(productionPayload());

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations",
      expect.any(FormData),
      { headers: { "Idempotency-Key": expect.any(String) } }
    );
    expect(idempotencyKeyAt(0)).toBeTruthy();
    expect(result.production).toEqual({ id: 10, name: "Peter Eventos" });
    expect(result.organization).toBeUndefined();
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { organization: { id: 11, name: "Peter Eventos" } } });

    await expect(cutinappService.createProduction(productionPayload())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(cutinappService.createProduction(productionPayload())).resolves.toMatchObject({ production: { id: 11 } });

    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { organization: { id: 12, name: "Peter Eventos" } } });

    await expect(cutinappService.createProduction(productionPayload())).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await cutinappService.createProduction(productionPayload());

    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });
});
