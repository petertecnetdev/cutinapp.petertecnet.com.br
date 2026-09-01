describe("Peter Account gateway", () => {
  it("keeps SSO codes separate from application JWTs", () => {
    const url = new URL("https://cutinapp.petertecnet.com.br/?peter_sso=temporary-code");
    expect(url.searchParams.get("peter_sso")).toBe("temporary-code");
    expect(url.searchParams.has("token")).toBe(false);
    expect(url.searchParams.has("access_token")).toBe(false);
  });
});
