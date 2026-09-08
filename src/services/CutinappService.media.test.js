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

const buildMedia = ({ caption = "Palco principal", name = "evento.jpg", content = "image-bytes" } = {}) => {
  const body = new FormData();
  body.append("caption", caption);
  body.append("photo", new File([content], name, { type: "image/jpeg", lastModified: 123456789 }));
  return body;
};

const idempotencyKeyAt = (callIndex) => (
  appApiClient.post.mock.calls[callIndex]?.[2]?.headers?.["Idempotency-Key"]
);

describe("CutinappService production media upload idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("protects media uploads with an idempotency key", async () => {
    const body = buildMedia();
    appApiClient.post.mockResolvedValueOnce({ data: { media: { id: 201 } } });

    await expect(cutinappService.uploadProductionMedia("12", body)).resolves.toEqual({ media: { id: 201 } });
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/12/media",
      body,
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the same key after an uncertain network failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { media: { id: 202 } } });

    await expect(cutinappService.uploadProductionMedia(12, buildMedia())).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = idempotencyKeyAt(0);

    await expect(cutinappService.uploadProductionMedia("12", buildMedia())).resolves.toEqual({ media: { id: 202 } });
    expect(idempotencyKeyAt(1)).toBe(firstKey);
  });

  test("uses a fresh key after a definitive validation failure", async () => {
    appApiClient.post
      .mockRejectedValueOnce({ response: { status: 422 } })
      .mockResolvedValueOnce({ data: { media: { id: 203 } } });

    await expect(cutinappService.uploadProductionMedia(12, buildMedia())).rejects.toMatchObject({ response: { status: 422 } });
    const rejectedKey = idempotencyKeyAt(0);

    await cutinappService.uploadProductionMedia(12, buildMedia());
    expect(idempotencyKeyAt(1)).toBeTruthy();
    expect(idempotencyKeyAt(1)).not.toBe(rejectedKey);
  });

  test("deduplicates equivalent concurrent uploads", async () => {
    let resolveUpload;
    appApiClient.post.mockImplementationOnce(() => new Promise((resolve) => { resolveUpload = resolve; }));

    const first = cutinappService.uploadProductionMedia(12, buildMedia());
    const second = cutinappService.uploadProductionMedia("12", buildMedia());

    expect(first).toBe(second);
    expect(appApiClient.post).toHaveBeenCalledTimes(1);

    resolveUpload({ data: { media: { id: 204 } } });
    await expect(first).resolves.toEqual({ media: { id: 204 } });
  });

  test("does not coalesce uploads with different captions", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { media: { id: 205 } } })
      .mockResolvedValueOnce({ data: { media: { id: 206 } } });

    await Promise.all([
      cutinappService.uploadProductionMedia(12, buildMedia({ caption: "Palco" })),
      cutinappService.uploadProductionMedia(12, buildMedia({ caption: "Pista" })),
    ]);

    expect(appApiClient.post).toHaveBeenCalledTimes(2);
    expect(idempotencyKeyAt(0)).not.toBe(idempotencyKeyAt(1));
  });
});


describe("CutinappService production media deletion idempotency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  const deletionKeyAt = (callIndex) => (
    appApiClient.delete.mock.calls[callIndex]?.[1]?.headers?.["Idempotency-Key"]
  );

  test("protects media deletion and normalizes resource identifiers", async () => {
    appApiClient.delete.mockResolvedValueOnce({ data: { deleted: true } });
    await expect(cutinappService.deleteProductionMedia("12", "201")).resolves.toEqual({ deleted: true });
    expect(appApiClient.delete).toHaveBeenCalledWith(
      "/organizations/12/media/201",
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reuses the media deletion key after an uncertain network failure", async () => {
    appApiClient.delete
      .mockRejectedValueOnce({ code: "ERR_NETWORK", message: "Network Error" })
      .mockResolvedValueOnce({ data: { deleted: true } });

    await expect(cutinappService.deleteProductionMedia(12, 201)).rejects.toMatchObject({ code: "ERR_NETWORK" });
    const firstKey = deletionKeyAt(0);
    await expect(cutinappService.deleteProductionMedia("12", "201")).resolves.toEqual({ deleted: true });
    expect(deletionKeyAt(1)).toBe(firstKey);
  });
});
