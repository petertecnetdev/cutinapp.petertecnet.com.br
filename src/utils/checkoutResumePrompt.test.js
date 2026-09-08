import { findPendingCheckout, isResumePromptRoute, resumePromptSlugForRoute } from "./checkoutResumePrompt";
import { CHECKOUT_RECOVERY_TTL_MS } from "./checkoutRecovery";

const storageOf = (entries = {}) => {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
  };
};

describe("checkout resume prompt", () => {
  test("shows on discovery routes and on a specific event page, but never inside checkout", () => {
    expect(isResumePromptRoute("/")).toBe(true);
    expect(isResumePromptRoute("/home")).toBe(true);
    expect(isResumePromptRoute("/event")).toBe(true);
    expect(isResumePromptRoute("/event/festival-x")).toBe(true);
    expect(isResumePromptRoute("/event/festival-x/")).toBe(true);
    expect(isResumePromptRoute("/checkout/festival-x")).toBe(false);
    expect(resumePromptSlugForRoute("/event/festival-x")).toBe("festival-x");
    expect(resumePromptSlugForRoute("/home")).toBeNull();
  });

  test("finds a valid pending selection without trusting stale prices", () => {
    const storage = storageOf({
      "cutinapp_checkout_festival-x": JSON.stringify({
        eventId: 44,
        eventDate: "2030-10-10T20:00:00-03:00",
        tickets: [{ id: 1, quantity: 2 }],
        items: [{ id: 9, quantity: 1 }],
      }),
    });

    expect(findPendingCheckout(storage, new Date("2030-10-09T12:00:00-03:00").getTime())).toEqual({
      slug: "festival-x",
      eventId: 44,
      quantity: 3,
      eventAt: new Date("2030-10-10T20:00:00-03:00").getTime(),
      hasOrder: false,
      source: "session",
    });
  });

  test("filters the event detail prompt to the event currently being viewed", () => {
    const now = new Date("2030-11-01T12:00:00-03:00").getTime();
    const storage = storageOf({
      "cutinapp_checkout_other-event": JSON.stringify({
        eventId: 8,
        eventDate: "2030-11-02T20:00:00-03:00",
        tickets: [{ id: 1, quantity: 3 }],
      }),
      "cutinapp_checkout_festival-x": JSON.stringify({
        eventId: 7,
        eventDate: "2030-11-20T20:00:00-03:00",
        tickets: [{ id: 2, quantity: 1 }],
      }),
    });

    expect(findPendingCheckout(storage, now, null, "festival-x")).toMatchObject({
      slug: "festival-x",
      eventId: 7,
      quantity: 1,
    });
    expect(findPendingCheckout(storage, now, null, "missing-event")).toBeNull();
  });

  test("ignores expired, empty and dismissed selections", () => {
    const now = new Date("2030-10-11T12:00:00-03:00").getTime();
    const storage = storageOf({
      "cutinapp_checkout_expired": JSON.stringify({ eventId: 1, eventDate: "2030-10-10T20:00:00-03:00", tickets: [{ id: 1, quantity: 2 }] }),
      "cutinapp_checkout_empty": JSON.stringify({ eventId: 2, eventDate: "2030-10-12T20:00:00-03:00", tickets: [] }),
      "cutinapp_checkout_hidden": JSON.stringify({ eventId: 3, eventDate: "2030-10-12T20:00:00-03:00", tickets: [{ id: 3, quantity: 1 }] }),
      "cutinapp_checkout_resume_dismissed_hidden": "1",
    });

    expect(findPendingCheckout(storage, now)).toBeNull();
  });

  test("prioritizes the nearest upcoming event when more than one purchase is pending", () => {
    const storage = storageOf({
      "cutinapp_checkout_later": JSON.stringify({ eventId: 8, eventDate: "2030-11-20T20:00:00-03:00", tickets: [{ id: 1, quantity: 1 }] }),
      "cutinapp_checkout_sooner": JSON.stringify({ eventId: 7, eventDate: "2030-11-10T20:00:00-03:00", tickets: [{ id: 2, quantity: 2 }] }),
    });

    expect(findPendingCheckout(storage, new Date("2030-11-01T12:00:00-03:00").getTime())).toMatchObject({
      slug: "sooner",
      eventId: 7,
      quantity: 2,
      source: "session",
    });
  });

  test("recovers a selection saved across browser sessions", () => {
    const now = new Date("2030-11-01T12:00:00-03:00").getTime();
    const recoveryStorage = storageOf({
      "cutinapp_checkout_recovery_festival-persisted": JSON.stringify({
        version: 1,
        selection: { tickets: [{ id: 5, quantity: 2 }], items: [{ id: 9, quantity: 1 }] },
        orderPublicId: null,
        savedAt: now - 30 * 60 * 1000,
      }),
    });

    expect(findPendingCheckout(storageOf(), now, recoveryStorage)).toEqual({
      slug: "festival-persisted",
      eventId: null,
      quantity: 3,
      eventAt: null,
      hasOrder: false,
      source: "recovery",
      savedAt: now - 30 * 60 * 1000,
    });
  });

  test("filters persisted recovery to the current event without leaking another pending purchase", () => {
    const now = new Date("2030-11-01T12:00:00-03:00").getTime();
    const recoveryStorage = storageOf({
      "cutinapp_checkout_recovery_other-event": JSON.stringify({
        version: 1,
        selection: { tickets: [{ id: 5, quantity: 2 }] },
        orderPublicId: "ORD-OTHER",
        savedAt: now - 5 * 60 * 1000,
      }),
      "cutinapp_checkout_recovery_festival-x": JSON.stringify({
        version: 1,
        selection: { tickets: [{ id: 6, quantity: 1 }] },
        orderPublicId: null,
        savedAt: now - 10 * 60 * 1000,
      }),
    });

    expect(findPendingCheckout(storageOf(), now, recoveryStorage, "festival-x")).toMatchObject({
      slug: "festival-x",
      quantity: 1,
      hasOrder: false,
    });
  });

  test("prioritizes a pending order so the buyer can follow confirmation instead of starting over", () => {
    const now = new Date("2030-11-01T12:00:00-03:00").getTime();
    const sessionStorage = storageOf({
      "cutinapp_checkout_other-event": JSON.stringify({
        eventId: 88,
        eventDate: "2030-11-02T20:00:00-03:00",
        tickets: [{ id: 2, quantity: 1 }],
      }),
    });
    const recoveryStorage = storageOf({
      "cutinapp_checkout_recovery_pending-payment": JSON.stringify({
        version: 1,
        selection: { tickets: [{ id: 7, quantity: 2 }], items: [] },
        orderPublicId: "ORD-PENDING-1",
        savedAt: now - 10 * 60 * 1000,
      }),
    });

    expect(findPendingCheckout(sessionStorage, now, recoveryStorage)).toMatchObject({
      slug: "pending-payment",
      quantity: 2,
      hasOrder: true,
      source: "recovery",
    });
  });

  test("ignores stale persisted recovery entries", () => {
    const now = new Date("2030-11-10T12:00:00-03:00").getTime();
    const recoveryStorage = storageOf({
      "cutinapp_checkout_recovery_stale": JSON.stringify({
        version: 1,
        selection: { tickets: [{ id: 1, quantity: 1 }] },
        orderPublicId: null,
        savedAt: now - CHECKOUT_RECOVERY_TTL_MS - 1,
      }),
    });

    expect(findPendingCheckout(storageOf(), now, recoveryStorage)).toBeNull();
  });
});