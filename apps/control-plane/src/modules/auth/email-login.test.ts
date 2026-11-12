import { describe, expect, test } from "bun:test";

import { emailLoginOf } from "./email-login";

describe("emailLoginOf", () => {
  test("is on unless it is switched off, whether or not GitHub sign-in is there", () => {
    expect(emailLoginOf({}, false)).toBe(true);
    expect(emailLoginOf({}, true)).toBe(true);
    expect(emailLoginOf({ AVEN_EMAIL_LOGIN: "on" }, false)).toBe(true);
    expect(emailLoginOf({ AVEN_EMAIL_LOGIN: "anything" }, false)).toBe(true);
  });

  test("is off when switched off and GitHub sign-in is there", () => {
    expect(emailLoginOf({ AVEN_EMAIL_LOGIN: "off" }, true)).toBe(false);
  });

  test("refuses to start when switched off with no GitHub sign-in, which would lock everyone out", () => {
    expect(() => emailLoginOf({ AVEN_EMAIL_LOGIN: "off" }, false)).toThrow(
      /GITHUB_LOGIN_CLIENT_ID/,
    );
  });
});
