import { describe, expect, test } from "bun:test";

import { spacesApiBase, spacesRunnerUrl } from "./config";

describe("the spaces settings", () => {
  test("the server address is an http or https address, or nothing", () => {
    expect(spacesApiBase(undefined)).toBeNull();
    expect(spacesApiBase("  ")).toBeNull();
    expect(spacesApiBase("not a url")).toBeNull();
    expect(spacesApiBase("ftp://spaces.test")).toBeNull();
    expect(spacesApiBase("https://spaces.test/api/v1/")).toBe("https://spaces.test/api/v1");
    expect(spacesApiBase("http://192.168.1.5:8787/api/v1")).toBe("http://192.168.1.5:8787/api/v1");
  });

  test("the address a sandbox dials is its own setting and may be on a private network", () => {
    expect(
      spacesRunnerUrl({
        AVEN_SPACES_RUNNER_URL: "http://192.168.1.10:8000/",
        BETTER_AUTH_URL: "https://aven.example.com",
      }),
    ).toBe("http://192.168.1.10:8000");
    expect(spacesRunnerUrl({ BETTER_AUTH_URL: "https://aven.example.com" })).toBe(
      "https://aven.example.com/api",
    );
  });

  test("an address that is not http says which setting is wrong", () => {
    expect(() => spacesRunnerUrl({ AVEN_SPACES_RUNNER_URL: "ftp://x" })).toThrow(
      "AVEN_SPACES_RUNNER_URL",
    );
    expect(() => spacesRunnerUrl({ AVEN_SPACES_RUNNER_URL: "nope" })).toThrow(
      "AVEN_SPACES_RUNNER_URL",
    );
  });
});
