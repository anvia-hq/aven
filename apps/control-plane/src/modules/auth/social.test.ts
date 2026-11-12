import { describe, expect, test } from "bun:test";

import { socialProvidersOf } from "./social";

describe("socialProvidersOf", () => {
  test("offers GitHub only when both its id and secret are set", () => {
    expect(socialProvidersOf({}, "https://aven.test")).toEqual({});
    expect(socialProvidersOf({ GITHUB_LOGIN_CLIENT_ID: "id" }, "https://aven.test")).toEqual({});
    expect(socialProvidersOf({ GITHUB_LOGIN_CLIENT_SECRET: "s" }, "https://aven.test")).toEqual({});
  });

  test("sends GitHub back through the platform's /api proxy", () => {
    expect(
      socialProvidersOf(
        { GITHUB_LOGIN_CLIENT_ID: "id", GITHUB_LOGIN_CLIENT_SECRET: "s" },
        "https://aven.test",
      ),
    ).toEqual({
      github: {
        clientId: "id",
        clientSecret: "s",
        redirectURI: "https://aven.test/api/auth/callback/github",
      },
    });
  });
});
