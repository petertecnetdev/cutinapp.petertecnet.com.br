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

const photoPayload = () => {
  const payload = new FormData();
  payload.append("photo", new Blob(["gallery-photo"], { type: "image/jpeg" }), "photo.jpg");
  payload.append("caption", "Pista principal");
  return payload;
};

describe("CutinappService production gallery manager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test("uploads media with progress, cancellation signal and idempotency", async () => {
    const onUploadProgress = jest.fn();
    const controller = new AbortController();
    appApiClient.post.mockResolvedValueOnce({ data: { media: { id: 11, caption: "Pista principal" } } });

    const payload = photoPayload();
    const result = await cutinappService.uploadProductionMedia(25, payload, {
      onUploadProgress,
      signal: controller.signal,
    });

    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/25/media",
      payload,
      {
        headers: { "Idempotency-Key": expect.any(String) },
        onUploadProgress,
        signal: controller.signal,
      },
    );
    expect(result.media.id).toBe(11);
  });

  test("updates caption, alt text, album, focal point and featured state", async () => {
    const payload = {
      caption: "Pista iluminada",
      alt_text: "Pista principal da casa noturna",
      album_id: 3,
      focal_x: 62,
      focal_y: 41,
      is_featured: true,
    };
    appApiClient.patch.mockResolvedValueOnce({ data: { media: { id: 12, ...payload } } });

    await expect(cutinappService.updateProductionMedia(25, 12, payload))
      .resolves.toMatchObject({ media: { id: 12, caption: "Pista iluminada" } });

    expect(appApiClient.patch).toHaveBeenCalledWith(
      "/organizations/25/media/12",
      payload,
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("reorders media and bulk moves selected photos to an album", async () => {
    appApiClient.patch
      .mockResolvedValueOnce({ data: { media: [{ id: 14 }, { id: 13 }] } })
      .mockResolvedValueOnce({ data: { media: [{ id: 14, album_id: 7 }, { id: 13, album_id: 7 }] } });

    await cutinappService.reorderProductionMedia(25, [14, 13]);
    await cutinappService.bulkUpdateProductionMedia(25, [14, 13], { album_id: 7 });

    expect(appApiClient.patch).toHaveBeenNthCalledWith(
      1,
      "/organizations/25/media-order",
      { media_ids: [14, 13] },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(appApiClient.patch).toHaveBeenNthCalledWith(
      2,
      "/organizations/25/media-bulk",
      { album_id: 7, media_ids: [14, 13] },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("soft deletes and restores selected photos", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { deleted_ids: [21, 22] } })
      .mockResolvedValueOnce({ data: { media: [{ id: 21 }, { id: 22 }] } });

    await cutinappService.bulkDeleteProductionMedia(25, [21, 22]);
    await cutinappService.restoreProductionMedia(25, [21, 22]);

    expect(appApiClient.post).toHaveBeenNthCalledWith(
      1,
      "/organizations/25/media-delete",
      { media_ids: [21, 22] },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(appApiClient.post).toHaveBeenNthCalledWith(
      2,
      "/organizations/25/media-restore",
      { media_ids: [21, 22] },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("replaces and rotates a photo without changing its media id", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { media: { id: 31, url: "/new.webp" } } })
      .mockResolvedValueOnce({ data: { media: { id: 31, rotation: 90 } } });

    const replacement = photoPayload();
    await cutinappService.replaceProductionMedia(25, 31, replacement);
    await cutinappService.rotateProductionMedia(25, 31, 90);

    expect(appApiClient.post.mock.calls[0][0]).toBe("/organizations/25/media/31/replace");
    expect(appApiClient.post).toHaveBeenNthCalledWith(
      2,
      "/organizations/25/media/31/rotate",
      { degrees: 90 },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("creates, lists and removes albums through generic organization routes", async () => {
    appApiClient.post.mockResolvedValueOnce({ data: { album: { id: 4, name: "Camarote" } } });
    appApiClient.get.mockResolvedValueOnce({ data: { albums: [{ id: 4, name: "Camarote" }] } });
    appApiClient.delete.mockResolvedValueOnce({ data: { message: "Álbum removido." } });

    await cutinappService.createProductionMediaAlbum(25, "Camarote");
    const albums = await cutinappService.productionMediaAlbums(25);
    await cutinappService.deleteProductionMediaAlbum(25, 4);

    expect(albums).toEqual([{ id: 4, name: "Camarote" }]);
    expect(appApiClient.post).toHaveBeenCalledWith(
      "/organizations/25/media-albums",
      { name: "Camarote" },
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(appApiClient.get).toHaveBeenCalledWith("/organizations/25/media-albums");
    expect(appApiClient.delete).toHaveBeenCalledWith(
      "/organizations/25/media-albums/4",
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });

  test("imports the current cover into the gallery and can promote a gallery photo to cover", async () => {
    appApiClient.post
      .mockResolvedValueOnce({ data: { media: { id: 41 } } })
      .mockResolvedValueOnce({ data: { path: "images/apps/app/organizations/background.webp" } });

    await cutinappService.importProductionCoverToGallery(25);
    await cutinappService.setProductionMediaCover(25, 41);

    expect(appApiClient.post).toHaveBeenNthCalledWith(
      1,
      "/organizations/25/media-import-cover",
      undefined,
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
    expect(appApiClient.post).toHaveBeenNthCalledWith(
      2,
      "/organizations/25/media/41/cover",
      undefined,
      { headers: { "Idempotency-Key": expect.any(String) } },
    );
  });
});
