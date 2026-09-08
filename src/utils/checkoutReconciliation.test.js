import { checkoutReconciliationMessage, summarizeCheckoutReconciliation } from "./checkoutReconciliation";

describe("summarizeCheckoutReconciliation", () => {
  test("details reduced quantities and quantifies known GMV removed", () => {
    const summary = summarizeCheckoutReconciliation({
      catalog: {
        tickets: [{ id: 1, name: "Pista", price: 80 }],
        items: [{ id: 2, name: "Copo", price: 20 }],
      },
      previousSelection: { tickets: [{ id: 1, quantity: 2 }], items: [{ id: 2, quantity: 2 }] },
      nextSelection: { tickets: [{ id: 1, quantity: 1 }], items: [{ id: 2, quantity: 1 }] },
    });

    expect(summary).toEqual({
      changes: [
        { kind: "ticket", id: 1, name: "Pista", previous_quantity: 2, new_quantity: 1, unit_price: 80, removed_value: 80 },
        { kind: "item", id: 2, name: "Copo", previous_quantity: 2, new_quantity: 1, unit_price: 20, removed_value: 20 },
      ],
      changed_lines: 2,
      previous_gmv: 200,
      reconciled_gmv: 100,
      gmv_removed: 100,
      unpriced_removed_lines: 0,
    });
  });

  test("does not invent GMV when a removed catalog line no longer has a known price", () => {
    const summary = summarizeCheckoutReconciliation({
      catalog: { tickets: [] },
      previousSelection: { tickets: [{ id: 9, quantity: 2 }] },
      nextSelection: { tickets: [] },
    });

    expect(summary.gmv_removed).toBe(0);
    expect(summary.unpriced_removed_lines).toBe(1);
    expect(summary.changes[0]).toMatchObject({ id: 9, previous_quantity: 2, new_quantity: 0 });
  });
});

describe("checkoutReconciliationMessage", () => {
  test("shows exactly what changed and the before/after total when fully priced", () => {
    const summary = {
      changes: [{ name: "Pista", previous_quantity: 2, new_quantity: 1 }],
      previous_gmv: 160,
      reconciled_gmv: 80,
      gmv_removed: 80,
      unpriced_removed_lines: 0,
    };

    expect(checkoutReconciliationMessage(summary, (value) => "R$ " + value)).toBe(
      "A disponibilidade mudou: Pista: 2 → 1. Total ajustado de R$ 160 para R$ 80. Revise o resumo antes de pagar."
    );
  });
});
