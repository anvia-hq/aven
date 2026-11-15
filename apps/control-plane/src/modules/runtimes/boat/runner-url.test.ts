import { describe, expect, test } from "bun:test";

import { UnavailableError } from "@aven/server-kit/errors";

import { runnerUrlFromEnv } from "./runner-url";

describe("the address a boat sandbox dials", () => {
  test("uses the site origin when none is set", () => {
    expect(runnerUrlFromEnv({ BETTER_AUTH_URL: "https://aven.example.com" })).toBe(
      "https://aven.example.com/api",
    );
  });

  test("uses an explicit public address", () => {
    expect(
      runnerUrlFromEnv({
        AVEN_BOAT_RUNNER_URL: "https://api.example.com/",
        BETTER_AUTH_URL: "http://localhost:5173",
      }),
    ).toBe("https://api.example.com");
  });

  test("refuses an address the sandbox cannot open", () => {
    for (const url of [
      "http://localhost:5173/api",
      "http://127.0.0.1:8000",
      "http://10.1.1.1/api",
      "http://192.168.1.9/api",
      "http://172.16.0.4/api",
    ]) {
      expect(() => runnerUrlFromEnv({ AVEN_BOAT_RUNNER_URL: url })).toThrow(UnavailableError);
    }
  });
});
