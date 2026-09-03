import { appSlug, apiBaseUrl, apiV1BaseUrl } from "./config";

test("Cutinapp keeps Peter account/realtime root and uses an app-scoped v1 business API", () => {
  expect(appSlug).toBe("cutinapp");
  expect(apiBaseUrl).toBe("https://api.petertecnet.com.br/api");
  expect(apiV1BaseUrl).toBe("https://api.petertecnet.com.br/api/v1/apps/cutinapp");
});
