import { normalizeEventMemory } from "./profileActivity";

describe("memory scoped permissions", () => {
  test("does not let event flags bypass an explicit permission container", () => {
    expect(normalizeEventMemory({
      id: 1,
      viewer_permissions: { can_publish: true },
      can_review: true,
    })).toEqual(expect.objectContaining({
      can_review: false,
      can_publish: true,
    }));
  });

  test("keeps legacy event flags when no scoped permission container exists", () => {
    expect(normalizeEventMemory({ id: 2, can_review: true, can_publish: false }))
      .toEqual(expect.objectContaining({ can_review: true, can_publish: false }));
  });

  test("hidden permission containers deny every scoped action", () => {
    expect(normalizeEventMemory({
      id: 3,
      viewer_permissions: { visible: false, can_review: true, can_publish: true },
      can_review: true,
      can_publish: true,
    })).toEqual(expect.objectContaining({ can_review: false, can_publish: false }));
  });
});
