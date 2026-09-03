import fs from "fs";
import path from "path";
import { apiBaseUrl, apiV1BaseUrl, appSlug } from "../config";

const serviceFiles = [
  "CommerceService.js",
  "CutinappService.js",
  "EventService.js",
  "TicketService.js",
];

describe("shared Peter API contracts", () => {
  test("uses the canonical application-scoped v1 base URL", () => {
    expect(apiV1BaseUrl).toBe(`${apiBaseUrl}/v1/apps/${appSlug}`);
  });

  test("ApiClient is bound to the canonical v1 application scope", () => {
    const source = fs.readFileSync(path.join(__dirname, "ApiClient.js"), "utf8");
    expect(source).toContain("baseURL: apiV1BaseUrl");
    expect(source).not.toContain("baseURL: apiBaseUrl");
  });

  test.each(serviceFiles)("%s does not call product-prefixed API routes", (fileName) => {
    const source = fs.readFileSync(path.join(__dirname, fileName), "utf8");
    expect(source).not.toMatch(/[\"'`]\/cutinapp(?:\/|[\"'`])/i);
  });
});
