import { hasContextRole } from "./applicationRoles";

describe("hasContextRole", () => {
  test("accepts acquisition agent as the primary Cutinapp role", () => {
    const user = {
      applications: [{
        slug: "cutinapp",
        pivot: { status: "active", role: "acquisition_agent", metadata: null },
      }],
    };

    expect(hasContextRole(user, "acquisition_agent")).toBe(true);
  });

  test("accepts acquisition agent as an additional metadata role", () => {
    const user = {
      applications: [{
        slug: "cutinapp",
        pivot: {
          status: "active",
          role: "producer",
          metadata: JSON.stringify({ roles: ["producer", "acquisition_agent"] }),
        },
      }],
    };

    expect(hasContextRole(user, "acquisition_agent")).toBe(true);
  });

  test("rejects inactive and unrelated memberships", () => {
    expect(hasContextRole({ applications: [{ slug: "cutinapp", pivot: { status: "inactive", role: "acquisition_agent" } }] }, "acquisition_agent")).toBe(false);
    expect(hasContextRole({ applications: [{ slug: "rasoio", pivot: { status: "active", role: "acquisition_agent" } }] }, "acquisition_agent")).toBe(false);
  });
});
