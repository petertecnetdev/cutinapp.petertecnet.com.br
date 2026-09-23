import { deriveMemoryTimeline } from "./profileActivity";

describe("profile memory place privacy", () => {
  test("does not leak a nested place explicitly hidden from the viewer", () => {
    const now = new Date("2026-09-23T12:00:00Z").getTime();
    const memories = deriveMemoryTimeline([
      {
        id: 1,
        title: "Visible event, private place",
        end_date: "2026-09-22T12:00:00Z",
        place: { id: 10, name: "Private place", viewer_can_see: false },
      },
      {
        id: 2,
        title: "Visible event, serialized private establishment",
        end_date: "2026-09-22T13:00:00Z",
        establishment: { id: 11, name: "Hidden establishment", visible: "0" },
      },
      {
        id: 3,
        title: "Visible place",
        end_date: "2026-09-22T14:00:00Z",
        place: { id: 12, name: "Public place", viewer_can_see: true },
      },
      {
        id: 4,
        title: "Legacy place label",
        end_date: "2026-09-22T15:00:00Z",
        place: "Legacy venue",
      },
    ], now);

    expect(memories.find((memory) => memory.id === 1)?.place).toBeNull();
    expect(memories.find((memory) => memory.id === 2)?.place).toBeNull();
    expect(memories.find((memory) => memory.id === 3)?.place).toMatchObject({ id: 12, name: "Public place" });
    expect(memories.find((memory) => memory.id === 4)?.place).toBe("Legacy venue");
  });
});
