import { clearEventCreationDraft, EVENT_CREATION_DRAFT_TTL_MS, readEventCreationDraft, writeEventCreationDraft } from "./eventCreationDraft";

beforeEach(() => window.localStorage.clear());

test("restores a recent event creation draft without persisting sensitive contact or file fields", () => {
  const now = Date.now();
  expect(writeEventCreationDraft(7, {
    form: {
      production_id: 12,
      title: "Festival",
      description: "Descrição",
      address: "Rua A, 10",
      city: "São Paulo",
      uf: "sp",
      start_date: "2026-09-20T20:00",
      end_date: "2026-09-20T23:00",
      contact_email: "producer@example.com",
      contact_phone: "11999999999",
      image: { name: "flyer.jpg" },
    },
    useProductionItems: true,
  }, now)).toBe(true);

  expect(readEventCreationDraft(7, now + 1000)).toMatchObject({
    form: {
      production_id: "12",
      title: "Festival",
      city: "São Paulo",
      uf: "SP",
      contact_email: "",
      contact_phone: "",
      image: null,
    },
    useProductionItems: true,
  });
});

test("isolates drafts by user and expires stale drafts", () => {
  const now = Date.now();
  writeEventCreationDraft(7, { form: { title: "Evento A" } }, now);
  expect(readEventCreationDraft(8, now)).toBeNull();
  expect(readEventCreationDraft(7, now + EVENT_CREATION_DRAFT_TTL_MS + 1)).toBeNull();
});

test("clears a completed draft", () => {
  writeEventCreationDraft(7, { form: { title: "Evento A" } });
  expect(clearEventCreationDraft(7)).toBe(true);
  expect(readEventCreationDraft(7)).toBeNull();
});
