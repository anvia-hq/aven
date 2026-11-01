import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { parseEnv } from "./env-file";
import { writeServerFiles } from "./server-files";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "aven-server-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const options = { origin: "http://localhost:2836", port: 2836, version: "1.0.0" };
const files = {
  compose: "services: {}\n",
  envTemplate: "AVEN_VERSION=latest\nPOSTGRES_PASSWORD=\n",
};

test("writes the compose file and a new .env readable by its owner only", async () => {
  expect(await writeServerFiles(join(dir, "server"), files, options)).toBe(true);
  expect(await readFile(join(dir, "server", "docker-compose.yml"), "utf8")).toBe(files.compose);
  const env = parseEnv(await readFile(join(dir, "server", ".env"), "utf8"));
  expect(env.AVEN_VERSION).toBe("1.0.0");
  expect(env.POSTGRES_PASSWORD).not.toBe("");
  expect((await stat(join(dir, "server", ".env"))).mode & 0o777).toBe(0o600);
});

test("keeps an existing .env and brings the compose file up to date", async () => {
  await writeServerFiles(dir, files, options);
  const before = await readFile(join(dir, ".env"), "utf8");
  await writeFile(join(dir, "docker-compose.yml"), "old");

  expect(
    await writeServerFiles(dir, { ...files, compose: "new" }, { ...options, version: "2" }),
  ).toBe(false);
  expect(await readFile(join(dir, ".env"), "utf8")).toBe(before);
  expect(await readFile(join(dir, "docker-compose.yml"), "utf8")).toBe("new");
});
