import { describe, expect, test } from "bun:test";

import { withUserBus } from "./user-bus";

describe("withUserBus", () => {
  const there = () => true;

  test("gives the user's runtime directory when the session has none", () => {
    expect(withUserBus({ PATH: "/bin" }, 1000, there)).toEqual({
      PATH: "/bin",
      XDG_RUNTIME_DIR: "/run/user/1000",
    });
  });

  test("keeps a runtime directory the session already has", () => {
    const env = { XDG_RUNTIME_DIR: "/run/user/42" };
    expect(withUserBus(env, 1000, there)).toBe(env);
  });

  test("leaves the environment alone when systemd made no directory for the user", () => {
    const env = { PATH: "/bin" };
    expect(withUserBus(env, 1000, () => false)).toBe(env);
  });

  test("leaves the environment alone without a user id", () => {
    const env = { PATH: "/bin" };
    expect(withUserBus(env, undefined, there)).toBe(env);
  });
});
