import fs from "fs";
import path from "path";
import { apiBaseUrl, apiV1BaseUrl, appSlug } from "../config";

const serviceFiles = [
  "CommerceService.js",
  "CutinappService.js",
  "EventService.js",
  "FinanceService.js",
  "TicketService.js",
];

const readService = (fileName) => fs.readFileSync(path.join(__dirname, fileName), "utf8");

const legacyRoutePatterns = [
  /["'`]\/cutinapp(?:\/|["'`])/i,
  /["'`]\/productions(?:\/|["'`])/i,
  /["'`]\/courtesies(?:\/|["'`])/i,
  /["'`]\/discovery\/facets["'`]/i,
  /["'`]\/follow["'`]/i,
  /["'`]\/preferences["'`]/i,
  /\/events\/show\//i,
  /\/checkin\/event\//i,
];

describe("shared Peter API contracts", () => {
  test("uses the canonical application-scoped v1 base URL", () => {
    expect(apiV1BaseUrl).toBe(`${apiBaseUrl}/v1/apps/${appSlug}`);
  });

  test("ApiClient is bound to the canonical v1 application scope", () => {
    const source = readService("ApiClient.js");
    expect(source).toContain("baseURL: apiV1BaseUrl");
    expect(source).not.toContain("baseURL: apiBaseUrl");
  });

  test.each(serviceFiles)("%s does not call legacy or product-prefixed API routes", (fileName) => {
    const source = readService(fileName);
    legacyRoutePatterns.forEach((pattern) => expect(source).not.toMatch(pattern));
  });

  test("platform service consumes canonical organization, social, ticket and check-in capabilities", () => {
    const source = readService("CutinappService.js");
    expect(source).toContain("/organizations/mine");
    expect(source).toContain("/organizations/public");
    expect(source).toContain("/agreement");
    expect(source).toContain("/social/follow");
    expect(source).toContain("/social/preferences");
    expect(source).toContain("/tickets/${ticketId}");
    expect(source).toContain("/checkin/events/${eventId}/stats");
    expect(source).toContain("apiClient.patch(`/notifications/${notificationId}/read`)");
    expect(source).toContain('apiClient.patch("/notifications/read-all")');
  });

  test("event service uses canonical management methods and paths", () => {
    const source = readService("EventService.js");
    expect(source).toContain("apiClient.put(`/events/${eventId}`");
    expect(source).toContain("apiClient.get(`/events/${eventId}/manage`)");
    expect(source).not.toContain("apiClient.post(`/events/${eventId}`");
  });

  test("finance service stays inside the generic organization finance capability", () => {
    const source = readService("FinanceService.js");
    expect(source).toContain("/organizations/${productionId}/finance");
    expect(source).not.toContain("/finance/productions/");
  });
});
