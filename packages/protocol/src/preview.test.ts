import { describe, expect, test } from "bun:test";

import { isPreviewPort, normalizePreviewPath, previewPortRefusal } from "./preview";

describe("a preview's port", () => {
  test("is a whole number between 1 and 65535", () => {
    for (const port of [1, 3000, 5173, 65535]) expect(isPreviewPort(port)).toBe(true);
    for (const port of [0, -1, 3000.5, 65536, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isPreviewPort(port)).toBe(false);
      expect(previewPortRefusal(port)).toBe("That is not a port");
    }
  });

  test("is refused when another service of the machine owns it", () => {
    for (const port of [22, 2375, 2376, 3389, 5432, 6379, 27017, 5900]) {
      expect(previewPortRefusal(port)).toContain(String(port));
      expect(previewPortRefusal(port)).toContain("not a preview");
    }
  });

  test("is allowed when it is a dev server", () => {
    for (const port of [3000, 4173, 5173, 8080, 8001]) {
      expect(previewPortRefusal(port)).toBeUndefined();
    }
  });
});

describe("normalizePreviewPath", () => {
  test("keeps safe relative paths with query and hash", () => {
    expect(normalizePreviewPath()).toBe("/");
    expect(normalizePreviewPath("")).toBe("/");
    expect(normalizePreviewPath("/")).toBe("/");
    expect(normalizePreviewPath("dashboard?tab=1#top")).toBe("/dashboard?tab=1#top");
    expect(normalizePreviewPath("/a/b/../c?x=1#y")).toBe("/a/c?x=1#y");
  });

  test("falls back to root for external schemes, protocol-relative paths, or control characters", () => {
    for (const bad of [
      "//evil.test/steal",
      "/a/..//evil.test/steal",
      "/\\evil.test",
      "https://evil.test/x",
      "javascript:alert(1)",
      "/ok\r\nSet-Cookie: a=1",
    ]) {
      expect(normalizePreviewPath(bad)).toBe("/");
    }
  });
});
