import { parseSafeHttpUrl, safeExternalHref, safeNavigationTarget } from "./safeUrl";

const origin = "https://cutinapp.petertecnet.com.br";

test("accepts http and https URLs", () => {
  expect(parseSafeHttpUrl("https://petertecnet.com.br", origin)?.protocol).toBe("https:");
  expect(parseSafeHttpUrl("http://example.com", origin)?.protocol).toBe("http:");
});

test("rejects executable and unsupported URL schemes", () => {
  expect(parseSafeHttpUrl("javascript:alert(1)", origin)).toBeNull();
  expect(parseSafeHttpUrl("data:text/html,<script>alert(1)</script>", origin)).toBeNull();
  expect(parseSafeHttpUrl("file:///etc/passwd", origin)).toBeNull();
});

test("keeps same-origin notification routes inside React navigation", () => {
  expect(safeNavigationTarget("/notifications?filter=unread#latest", origin)).toEqual({
    type: "internal",
    value: "/notifications?filter=unread#latest",
  });
});

test("normalizes safe external URLs and blocks unsafe hrefs", () => {
  expect(safeExternalHref("https://example.com/path", origin)).toBe("https://example.com/path");
  expect(safeExternalHref("javascript:alert(1)", origin)).toBe("");
  expect(safeNavigationTarget("https://example.com/path", origin)).toEqual({
    type: "external",
    value: "https://example.com/path",
  });
});
