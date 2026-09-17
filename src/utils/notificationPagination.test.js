import { mergeNotificationPage } from "./notificationPagination";

describe("mergeNotificationPage", () => {
  test("replaces stale first-page results", () => {
    expect(mergeNotificationPage([{ id: 1 }], [{ id: 2 }], 1)).toEqual([{ id: 2 }]);
  });

  test("appends only unseen items on later pages", () => {
    expect(mergeNotificationPage([{ id: 1 }], [{ id: 1 }, { id: 2 }], 2)).toEqual([{ id: 1 }, { id: 2 }]);
  });
});
