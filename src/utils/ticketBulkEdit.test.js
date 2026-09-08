import {
  buildBulkTicketUpdatePayload,
  defaultBulkTicketSelection,
  maxIssuedAcrossTickets,
} from "./ticketBulkEdit";

test("preselects the source and high confidence similar tickets", () => {
  expect(defaultBulkTicketSelection(
    { id: 10 },
    [
      { id: 11, similarity_score: 100 },
      { id: 12, similarity_score: 84 },
      { id: 13, similarity_score: 90 },
    ],
  )).toEqual([10, 11, 13]);
});

test("builds a partial bulk update so disabled fields remain untouched", () => {
  const payload = buildBulkTicketUpdatePayload({
    selectedIds: [10, 11, 11],
    enabledFields: { name: true, price: false, quantity: true, cutoff: true, description: false },
    values: { name: "2º Lote", price: "50", quantity: 180, description: "não alterar" },
    cutoffRule: { mode: "after_start", offsetMinutes: 120 },
  });

  expect(payload).toEqual({
    ticket_ids: [10, 11],
    name: "2º Lote",
    quantity: 180,
    sales_cutoff_mode: "after_start",
    sales_cutoff_offset_minutes: 120,
  });
});

test("finds the highest issued quantity across selected tickets", () => {
  expect(maxIssuedAcrossTickets([
    { passes_count: 5 },
    { passes_count: 12 },
    { passes_count: 2 },
  ])).toBe(12);
});
