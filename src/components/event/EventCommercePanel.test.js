import { reconcileStoredSelection } from "../../utils/checkoutSelectionRecovery";

describe("reconcileStoredSelection", () => {
  const catalog = {
    event: { id: 77 },
    tickets: [
      { id: 1, remaining: 2, available: true },
      { id: 2, remaining: 0, available: true },
      { id: 3, available: false },
      { id: 4 },
    ],
    items: [
      { id: 10, remaining: 1 },
      { id: 11, expired: true },
      { id: 12 },
    ],
  };

  it("restores only items that still belong to the same event and remain sellable", () => {
    expect(reconcileStoredSelection(catalog, {
      eventId: 77,
      tickets: [
        { id: 1, quantity: 5 },
        { id: 2, quantity: 1 },
        { id: 3, quantity: 1 },
        { id: 4, quantity: 3 },
        { id: 999, quantity: 1 },
      ],
      items: [
        { id: 10, quantity: 3 },
        { id: 11, quantity: 2 },
        { id: 12, quantity: 4 },
      ],
    })).toEqual({
      "ticket:1": 2,
      "ticket:4": 3,
      "item:10": 1,
      "item:12": 4,
    });
  });

  it("does not restore a selection from another event", () => {
    expect(reconcileStoredSelection(catalog, {
      eventId: 78,
      tickets: [{ id: 1, quantity: 1 }],
      items: [],
    })).toEqual({});
  });

  it("uses the fallback event id when the catalog omits event metadata", () => {
    expect(reconcileStoredSelection({ tickets: [{ id: 1 }], items: [] }, {
      eventId: 77,
      tickets: [{ id: 1, quantity: 2 }],
      items: [],
    }, 77)).toEqual({ "ticket:1": 2 });
  });
});
