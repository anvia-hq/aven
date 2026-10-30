import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { signInCommand } from "./github-signin";
import { runCommand } from "./run-command";

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const ada = { token: "ghu_secret", id: 42, login: "ada", name: "Ada L" };

// Runs the command as the container would: a shell in a home of its own, with git's global
// configuration in it.
async function run(home: string, github: Parameters<typeof signInCommand>[0]) {
  const { script, env } = signInCommand(github);
  const result = await runCommand(["sh", "-c", script], {
    env: { PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: "1", ...env },
  });
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
}
const home = async () => {
  const dir = await mkdtemp(join(tmpdir(), "aven-signin-"));
  homes.push(dir);
  return dir;
};
const gitConfig = async (dir: string, ...args: string[]) =>
  (
    await runCommand(["git", "config", "--global", ...args], {
      env: { PATH: process.env.PATH, HOME: dir },
    })
  ).stdout.trim();

describe("signing a container in to GitHub", () => {
  test("gives gh the token, git the credential helper, and commits the person's name and address", async () => {
    const dir = await home();

    await run(dir, ada);

    const hosts = await readFile(join(dir, ".config", "gh", "hosts.yml"), "utf8");
    expect(hosts).toBe(
      "github.com:\n    oauth_token: ghu_secret\n    user: ada\n    git_protocol: https\n",
    );
    // Only the container's user can read it.
    expect((await stat(join(dir, ".config", "gh", "hosts.yml"))).mode & 0o077).toBe(0);
    expect(await gitConfig(dir, "--get-all", "credential.https://github.com.helper")).toBe(
      "!gh auth git-credential",
    );
    expect(await gitConfig(dir, "user.name")).toBe("Ada L");
    expect(await gitConfig(dir, "user.email")).toBe("42+ada@users.noreply.github.com");
    // Git's own configuration does not hold the token.
    expect(await readFile(join(dir, ".gitconfig"), "utf8")).not.toContain("ghu_secret");
  });

  test("a person with no GitHub name is committed as their login", async () => {
    const dir = await home();

    await run(dir, { ...ada, name: null });

    expect(await gitConfig(dir, "user.name")).toBe("ada");
  });

  test("a second run replaces the first: the new token, one helper, the new person", async () => {
    const dir = await home();
    await run(dir, ada);

    await run(dir, { token: "ghu_other", id: 7, login: "grace", name: "Grace H" });

    expect(await readFile(join(dir, ".config", "gh", "hosts.yml"), "utf8")).toContain("ghu_other");
    expect(await readFile(join(dir, ".config", "gh", "hosts.yml"), "utf8")).not.toContain(
      "ghu_secret",
    );
    expect(await gitConfig(dir, "--get-all", "credential.https://github.com.helper")).toBe(
      "!gh auth git-credential",
    );
    expect(await gitConfig(dir, "user.email")).toBe("7+grace@users.noreply.github.com");
  });

  test("a run with no GitHub account signs the last person out, and commits still work", async () => {
    const dir = await home();
    await run(dir, ada);

    await run(dir, undefined);

    expect(await Bun.file(join(dir, ".config", "gh", "hosts.yml")).exists()).toBe(false);
    expect(await gitConfig(dir, "--get-all", "credential.https://github.com.helper")).toBe("");
    expect(await gitConfig(dir, "user.email")).toBe("aven@localhost");
    // Signing out when nobody was signed in is fine too.
    await run(await home(), undefined);
  });

  test("a name with quotes or a shell's special characters is taken as it is", async () => {
    const dir = await home();

    await run(dir, { ...ada, name: `Ada "$(touch pwned)" O'Neil` });

    expect(await gitConfig(dir, "user.name")).toBe(`Ada "$(touch pwned)" O'Neil`);
    expect(await Bun.file(join(dir, "pwned")).exists()).toBe(false);
  });

  test("the token is in the environment and not in the script", () => {
    const { script, env } = signInCommand(ada);

    expect(script).not.toContain("ghu_secret");
    expect(env.AVEN_GH_TOKEN).toBe("ghu_secret");
  });
});
