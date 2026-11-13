import { describe, expect, test } from "bun:test";

import { githubModeNote } from "./github-mode";

describe("what the runner's GitHub setting says it does", () => {
  test("machine mode names the login the machine has, and that it applies to everyone", () => {
    expect(githubModeNote("machine", { login: "indrazm" })).toContain("@indrazm");
    expect(githubModeNote("machine", { login: "indrazm" })).toContain("whoever sent the message");
  });

  test("machine mode says when gh is signed out or the runner has not said", () => {
    expect(githubModeNote("machine", { login: null })).toContain("gh is not signed in");
    expect(githubModeNote("machine", null)).toContain("has not said");
  });

  test("person mode says the machine's own login is not used", () => {
    expect(githubModeNote("person", { login: "indrazm" })).toContain(
      "the machine's own login is not used",
    );
  });
});
