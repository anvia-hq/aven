import { describe, expect, test } from "bun:test";

import { githubIdentityNote } from "./github-identity";

describe("what the ship bar says about the runner's GitHub", () => {
  test("names the login gh is signed in as on the machine", () => {
    const note = githubIdentityNote({ login: "indrazm" });
    expect(note?.label).toBe("GitHub: this machine (@indrazm)");
    expect(note?.detail).toContain("not your connected account");
  });

  test("says gh is not signed in, without claiming git cannot push", () => {
    const note = githubIdentityNote({ login: null });
    expect(note?.label).toBe("No GitHub");
    expect(note?.detail).toContain("git may still push");
  });

  test("says it is the person's own account when the runner is in person mode, whatever the machine has", () => {
    const note = githubIdentityNote({ login: "indrazm" }, "person");
    expect(note?.label).toBe("GitHub: your account");
    expect(githubIdentityNote(null, "person")?.label).toBe("GitHub: your account");
  });

  test("says nothing when the runner is offline or did not report", () => {
    expect(githubIdentityNote(null)).toBeNull();
  });
});
