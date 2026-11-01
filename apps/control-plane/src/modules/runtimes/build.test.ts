import { describe, expect, test } from "bun:test";

import { isBehind, serverBuild } from "./build";

describe("isBehind", () => {
  test("is true only for a runner older than the server", () => {
    expect(isBehind("0.2.9", "0.3.0")).toBe(true);
    expect(isBehind("0.3.0", "0.3.0")).toBe(false);
    expect(isBehind("0.4.0", "0.3.0")).toBe(false);
    expect(isBehind("1.0.0", "0.99.0")).toBe(false);
    expect(isBehind("0.9.0", "0.10.0")).toBe(true);
  });

  test("is false when either release is not a number", () => {
    expect(isBehind(undefined, "0.3.0")).toBe(false);
    expect(isBehind("0.2.0", undefined)).toBe(false);
    expect(isBehind("dev", "0.3.0")).toBe(false);
    expect(isBehind("0.2.0", "latest")).toBe(false);
    expect(isBehind("0.2.0-rc1", "0.3.0")).toBe(false);
  });
});

test("serverBuild is the release the server runs, or nothing for latest", () => {
  expect(serverBuild("0.3.0")).toBe("0.3.0");
  expect(serverBuild("latest")).toBeUndefined();
  expect(serverBuild(undefined)).toBeUndefined();
  expect(serverBuild("")).toBeUndefined();
});
