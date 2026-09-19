import { notifyGalleryUpdate, subscribeGalleryUpdates } from "./gallerySync";

describe("gallerySync", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("delivers same-tab gallery updates only to the matching organization", () => {
    const matching = jest.fn();
    const other = jest.fn();
    const stopMatching = subscribeGalleryUpdates(25, matching);
    const stopOther = subscribeGalleryUpdates(26, other);

    notifyGalleryUpdate(25, { action: "crop" });

    expect(matching).toHaveBeenCalledTimes(1);
    expect(matching.mock.calls[0][0]).toMatchObject({
      organizationId: 25,
      action: "crop",
    });
    expect(other).not.toHaveBeenCalled();

    stopMatching();
    stopOther();
  });

  test("unsubscribe stops future same-tab updates", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeGalleryUpdates(25, listener);
    unsubscribe();

    notifyGalleryUpdate(25, { action: "delete" });

    expect(listener).not.toHaveBeenCalled();
  });
});
