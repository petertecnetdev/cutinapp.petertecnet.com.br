import { deriveMemoryTimeline } from "./profileActivity";

describe("profile memory permission privacy", () => {
  const now = new Date("2026-09-23T12:00:00Z").getTime();

  test("hidden permission scopes cannot grant review or publication actions", () => {
    const memories = deriveMemoryTimeline([
      {
        id: 1,
        end_date: "2026-09-22T12:00:00Z",
        viewer_permissions: { can_review: true, can_publish: true, viewer_can_see: false },
        can_review: true,
        can_publish: true,
      },
      {
        id: 2,
        end_date: "2026-09-22T13:00:00Z",
        permissions: { can_review: 1, can_publish: "1", visible: "0" },
        can_review: true,
        can_publish: true,
      },
    ], now);

    expect(memories).toHaveLength(2);
    expect(memories[0]).toMatchObject({ id: 2, can_review: false, can_publish: false });
    expect(memories[1]).toMatchObject({ id: 1, can_review: false, can_publish: false });
  });

  test("visible permission scopes preserve explicit grants", () => {
    const [memory] = deriveMemoryTimeline([
      {
        id: 3,
        end_date: "2026-09-22T14:00:00Z",
        viewer_permissions: { can_review: 1, can_publish: "1", viewer_can_see: true },
      },
    ], now);

    expect(memory).toMatchObject({ id: 3, can_review: true, can_publish: true });
  });
});
