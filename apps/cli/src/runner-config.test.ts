import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { parseEnv } from "./env-file";
import { loadRunnerEnv, writeRunnerEnv } from "./runner-config";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aven-runner-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const settings = { url: "http://localhost:3000/api", token: "avrt_x", image: "img:1" };

test("writes the settings readable by the owner only", async () => {
  const file = join(dir, "runner.env");
  await writeRunnerEnv(file, settings);
  expect(parseEnv(await readFile(file, "utf8"))).toEqual({
    AVEN_URL: settings.url,
    AVEN_RUNTIME_TOKEN: "avrt_x",
    AVEN_SANDBOX_IMAGE: "img:1",
  });
  expect((await stat(file)).mode & 0o777).toBe(0o600);
});

test("a runner that works on its own machine writes its folders and no image", async () => {
  const file = join(dir, "runner.env");
  await writeRunnerEnv(file, {
    url: settings.url,
    token: "avrt_x",
    host: { dirs: ["/home/me/code", "/srv/work"] },
  });
  expect(parseEnv(await readFile(file, "utf8"))).toEqual({
    AVEN_URL: settings.url,
    AVEN_RUNTIME_TOKEN: "avrt_x",
    AVEN_SANDBOX: "host",
    AVEN_DIRS: "/home/me/code:/srv/work",
  });
});

test("a second install replaces the three and keeps what a person added", async () => {
  const file = join(dir, "runner.env");
  await writeRunnerEnv(file, settings);
  await writeFile(file, `${await readFile(file, "utf8")}AVEN_SANDBOX_MEMORY_MB=4096\n`);
  await writeRunnerEnv(file, { ...settings, token: "avrt_new" });
  const env = parseEnv(await readFile(file, "utf8"));
  expect(env.AVEN_RUNTIME_TOKEN).toBe("avrt_new");
  expect(env.AVEN_SANDBOX_MEMORY_MB).toBe("4096");
});

test("loading fills the environment without overriding it", async () => {
  const file = join(dir, "runner.env");
  await writeRunnerEnv(file, settings);
  const env: Record<string, string | undefined> = { AVEN_URL: "http://elsewhere" };
  expect(await loadRunnerEnv(file, env)).toBe(true);
  expect(env.AVEN_URL).toBe("http://elsewhere");
  expect(env.AVEN_RUNTIME_TOKEN).toBe("avrt_x");
  expect(await loadRunnerEnv(join(dir, "missing.env"), {})).toBe(false);
});
