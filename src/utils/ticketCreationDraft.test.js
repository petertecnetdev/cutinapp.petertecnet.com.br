import { clearTicketCreationDraft, readTicketCreationDraft, TICKET_CREATION_DRAFT_TTL_MS, writeTicketCreationDraft } from "./ticketCreationDraft";

beforeEach(() => {
  window.localStorage.clear();
});

test("persists and restores first ticket draft per user and event", () => {
  const now = Date.now();
  expect(writeTicketCreationDraft(7, 42, {
    kind: "paid",
    name: "1º Lote",
    price: "35.00",
    quantity: 180,
    limitDate: "2026-09-10T22:00",
    description: "Entrada inteira",
    optionalDetailsOpen: true,
  }, now)).toBe(true);

  expect(readTicketCreationDraft(7, 42, now + 1000)).toMatchObject({
    kind: "paid",
    name: "1º Lote",
    price: "35.00",
    quantity: 180,
    limitDate: "2026-09-10T22:00",
    description: "Entrada inteira",
    optionalDetailsOpen: true,
  });
  expect(readTicketCreationDraft(8, 42, now + 1000)).toBeNull();
  expect(readTicketCreationDraft(7, 43, now + 1000)).toBeNull();
});

test("expires stale ticket drafts", () => {
  const now = Date.now();
  writeTicketCreationDraft(7, 42, { price: "20.00", quantity: 10 }, now);
  expect(readTicketCreationDraft(7, 42, now + TICKET_CREATION_DRAFT_TTL_MS + 1)).toBeNull();
});

test("clears draft after successful ticket creation", () => {
  const now = Date.now();
  writeTicketCreationDraft(7, 42, { price: "20.00", quantity: 10 }, now);
  expect(clearTicketCreationDraft(7, 42)).toBe(true);
  expect(readTicketCreationDraft(7, 42, now + 1)).toBeNull();
});
