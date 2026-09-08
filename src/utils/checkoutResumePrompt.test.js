import { findPendingCheckout, isResumePromptRoute } from "./checkoutResumePrompt";

const storageOf = (entries = {}) => {
  const values = new Map(Object.entries(entries));
  return {
    get length() { return values.size; },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
  };
};

describe("checkout resume prompt", () => {
  test("shows only on discovery entry routes", () => {
    expect(isResumePromptRoute("/")).toBe(true);
    expect(isResumePromptRoute("/home")).toBe(true);
    expect(isResumePromptRoute("/event")).toBe(true);
    expect(isResumePromptRoute("/event/festival-x")).toBe(false);
    expect(isResumePromptRoute("/checkout/festival-x")).toBe(false);
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
    });
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
    });
  });
});
