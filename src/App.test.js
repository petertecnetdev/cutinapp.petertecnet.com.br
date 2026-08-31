import { appSlug, apiBaseUrl } from "./config";

test("Cutinapp uses the shared Peter Tecnet API with its own app scope", () => {
  expect(appSlug).toBe("cutinapp");
  expect(apiBaseUrl).toContain("api.petertecnet.com.br/api");
});
