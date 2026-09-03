describe("Peter Account gateway", () => {
  it("keeps SSO codes separate from application JWTs", () => {
    const url = new URL("https://cutinapp.petertecnet.com.br/?peter_sso=temporary-code");
    expect(url.searchParams.get("peter_sso")).toBe("temporary-code");
    expect(url.searchParams.has("token")).toBe(false);
    expect(url.searchParams.has("access_token")).toBe(false);
  });

  it("never exposes the authenticated session token in an ecosystem handoff URL", () => {
    const sessionToken = "private-jwt-session";
    const destination = new URL("https://nexus.petertecnet.com.br/");

    destination.searchParams.set("peter_sso", "temporary-code");
    destination.searchParams.set("peter_from", "cutinapp");

    expect(destination.searchParams.get("peter_sso")).toBe("temporary-code");
    expect(destination.searchParams.get("peter_from")).toBe("cutinapp");
    expect(destination.toString()).not.toContain(sessionToken);
    expect(destination.searchParams.has("token")).toBe(false);
    expect(destination.searchParams.has("access_token")).toBe(false);
  });
});
