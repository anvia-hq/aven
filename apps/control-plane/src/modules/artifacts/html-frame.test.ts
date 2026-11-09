import { expect, test } from "bun:test";

import { HTML_HEADERS, framedHtml } from "./html-frame";

test("the bridge goes first inside head, so a page is never put in quirks mode", () => {
  const out = framedHtml(
    "<!doctype html><html><head><title>x</title></head><body>hi</body></html>",
  );
  expect(out.startsWith("<!doctype html><html><head><script>")).toBe(true);
  expect(out).toContain("<title>x</title>");
});

test("a page with no head gets it after html, then after the doctype", () => {
  expect(framedHtml('<html lang="en"><body></body></html>')).toMatch(/^<html lang="en"><script>/);
  expect(framedHtml("<!DOCTYPE html><p>x</p>")).toMatch(
    /^<!DOCTYPE html><script>.*<\/script><p>x<\/p>$/s,
  );
});

test("the page is sandboxed with no network and no parent but our own", () => {
  const csp = HTML_HEADERS["content-security-policy"];
  expect(csp).toContain("sandbox allow-scripts");
  expect(csp).not.toContain("allow-same-origin");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("frame-ancestors 'self'");
});
