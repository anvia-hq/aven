import { describe, expect, test } from "bun:test";

import { readMachineGithubLogin } from "./github-login";
import type { runCommand } from "./run-command";

const answer =
  (stdout: string, code = 0): typeof runCommand =>
  async () => ({ stdout, stderr: "", code });

describe("the login gh is signed in as on this machine", () => {
  test("is the login gh prints", async () => {
    expect(await readMachineGithubLogin(answer("indrazm\n"))).toBe("indrazm");
  });

  test("is null when gh is signed out, missing, or says something that is not a login", async () => {
    expect(await readMachineGithubLogin(answer("", 1))).toBeNull();
    expect(await readMachineGithubLogin(answer("not logged in to any hosts"))).toBeNull();
    expect(
      await readMachineGithubLogin(async () => {
        throw new Error("spawn gh ENOENT");
      }),
    ).toBeNull();
  });
});
