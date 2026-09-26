import apiClient from "./ApiClient";
import aiContentService from "./AiContentService";

jest.mock("./ApiClient", () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock("./AppApiClient", () => ({ __esModule: true, default: { post: jest.fn() } }));

describe("AiContentService flyer grounding", () => {
  beforeEach(() => jest.clearAllMocks());

  test("sends one validated flyer with dynamic locale and keeps media metadata", async () => {
    apiClient.post.mockResolvedValueOnce({
      data: {
        description: "Descrição factual.",
        meta: { media_status: "used", media_confidence: 0.9 },
      },
    });

    const result = await aiContentService.generateDescription({
      entityType: "event",
      title: "Evento",
      locale: "en-US",
      context: { entityId: "42" },
      useAttachedMedia: true,
      media: [
        { kind: "flyer", dataUrl: "data:image/png;base64,YWJj" },
        { kind: "ignored", dataUrl: "data:image/png;base64,ZGVm" },
      ],
    });

    expect(apiClient.post).toHaveBeenCalledWith("/ai/content/description", expect.objectContaining({
      entity_type: "event",
      locale: "en-US",
      use_attached_media: true,
      media: [{ kind: "flyer", data_url: "data:image/png;base64,YWJj" }],
    }), { timeout: 80000 });
    expect(result.meta.media_status).toBe("used");
  });

  test("drops unsupported media instead of sending arbitrary content", async () => {
    apiClient.post.mockResolvedValueOnce({ data: { description: "Somente campos." } });

    await aiContentService.generateDescription({
      entityType: "production",
      title: "Produção",
      media: [{ kind: "flyer", dataUrl: "https://untrusted.example/flyer.png" }],
      useAttachedMedia: true,
    });

    expect(apiClient.post.mock.calls[0][1].media).toEqual([]);
  });
});
