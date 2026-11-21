import { describe, expect, test } from "bun:test";

import {
  DEFAULT_RELEASES_URL,
  isBehind,
  isValidRelease,
  parseReleaseTag,
  releasesUrl,
} from "./release";

describe("release helpers", () => {
  test("releasesUrl strips trailing slashes and falls back to default", () => {
    expect(releasesUrl("")).toBe(DEFAULT_RELEASES_URL);
    expect(releasesUrl("https://example.com/releases///")).toBe("https://example.com/releases");
  });

  test("parseReleaseTag extracts versions from redirect locations", () => {
    expect(parseReleaseTag("https://github.com/anvia-hq/aven/releases/tag/v1.2.3")).toBe("1.2.3");
    expect(
      parseReleaseTag("https://github.com/anvia-hq/aven/releases/tag/v1.2.3-rc.1", {
        strict: true,
      }),
    ).toBeUndefined();
    expect(parseReleaseTag("https://github.com/anvia-hq/aven/releases/tag/v1.2.3-rc.1")).toBe(
      "1.2.3-rc.1",
    );
    expect(parseReleaseTag(null)).toBeUndefined();
  });

  test("isValidRelease accepts semver and prerelease tags only", () => {
    expect(isValidRelease("1.2.3")).toBe(true);
    expect(isValidRelease("1.2.3-beta.1")).toBe(true);
    expect(isValidRelease("../evil")).toBe(false);
    expect(isValidRelease("latest")).toBe(false);
  });

  test("isBehind compares numeric versions", () => {
    expect(isBehind("0.1.0", "0.2.0")).toBe(true);
    expect(isBehind("0.2.0", "0.2.0")).toBe(false);
    expect(isBehind("0.3.0", "0.2.0")).toBe(false);
    expect(isBehind("dev", "0.2.0")).toBe(false);
  });
});
