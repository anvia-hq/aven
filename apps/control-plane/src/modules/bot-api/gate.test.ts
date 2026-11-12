import { describe, expect, test } from "bun:test";

import { BotApiRefusal, classify, holdsSecret, normalizePath, redact } from "./gate";

describe("classify", () => {
  test("a GET reads, a change changes, a delete and a ship or runner update need a yes", () => {
    expect(classify("GET", "/threads")).toBe("read");
    expect(classify("POST", "/projects")).toBe("change");
    expect(classify("PATCH", "/runtimes/1")).toBe("change");
    expect(classify("DELETE", "/folders/1")).toBe("confirm");
    expect(classify("POST", "/threads/1/ship")).toBe("confirm");
    expect(classify("POST", "/runtimes/1/update")).toBe("confirm");
  });

  test("sign-in, platform admin, runner tokens, secret values and streams are never available", () => {
    for (const [method, path] of [
      ["GET", "/auth/get-session"],
      ["POST", "/auth/organization/invite-member"],
      ["GET", "/platform/users"],
      ["DELETE", "/platform/users/1"],
      ["POST", "/runtimes"],
      ["POST", "/runtimes/1/rotate"],
      ["PUT", "/projects/1/variables/KEY"],
      ["PUT", "/variables/personal/KEY"],
      ["PUT", "/decision-model"],
      ["GET", "/threads/1/events"],
      ["GET", "/bots/1/events"],
      ["GET", "/threads/1/artifacts/a.png"],
      ["GET", "/workload-identity/jwks.json"],
      ["GET", "/github/connect"],
    ] as const) {
      expect(classify(method, path)).toBe("blocked");
    }
  });

  test("listing variables is a plain read", () => {
    expect(classify("GET", "/projects/1/variables")).toBe("read");
  });
});

describe("normalizePath", () => {
  test("keeps a path and its query, and drops a trailing slash", () => {
    expect(normalizePath("/threads/?archived=true")).toEqual({
      path: "/threads",
      sent: "/threads",
      search: "?archived=true",
    });
  });

  test("refuses addresses, doubled slashes and ways up", () => {
    for (const raw of [
      "threads",
      "//evil.test/x",
      "https://evil.test/x",
      "/a/%2e%2e%2fauth",
      "/a%2fb",
      "/a\\b",
    ]) {
      expect(() => normalizePath(raw)).toThrow(BotApiRefusal);
    }
  });

  test("a path is judged as it will be routed: decoded, dots resolved, any letter case", () => {
    for (const raw of [
      "/%61uth/get-session",
      "/a/../auth/x",
      "/a/%2e%2e/auth/x",
      "/AUTH/x",
      "/Platform/users",
    ]) {
      const { path } = normalizePath(raw);
      expect(classify("GET", path)).toBe("blocked");
    }
  });

  test("what is sent is the judged path, encoded part by part", () => {
    expect(normalizePath("/threads/a%20b/files").sent).toBe("/threads/a%20b/files");
    expect(normalizePath("/%61uth/x").sent).toBe("/auth/x");
  });
});

describe("secrets", () => {
  test("a body holding a key, token, secret or password is a secret, at any depth", () => {
    expect(holdsSecret({ name: "x", apiKey: "k" })).toBe(true);
    expect(holdsSecret({ headers: [{ token: "t" }] })).toBe(true);
    expect(holdsSecret({ name: "x", title: "token meeting" })).toBe(false);
  });

  test("a response hides those fields", () => {
    expect(redact({ id: 1, apiKey: "sk-1", nested: [{ password: "p", keyHint: "1234" }] })).toEqual(
      {
        id: 1,
        apiKey: "[hidden]",
        nested: [{ password: "[hidden]", keyHint: "1234" }],
      },
    );
  });
});
