import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "bun:test";

import { parseArgs } from "./args";
import { parseEnv } from "./env-file";
import { planServer } from "./server-plan";
import { envChangeLines, installEnvValues, writeServerFiles } from "./server-files";

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

const installed = [
  "AVEN_VERSION=0.9.0",
  "AVEN_PORT=3000",
  "AVEN_BIND=100.64.0.7",
  "AVEN_SITE_ADDRESS=:80",
  "AVEN_HTTPS_PORT=2838",
  "AVEN_HTTPS_BIND=127.0.0.1",
  "AVEN_API_PORT=2900",
  "BETTER_AUTH_URL=http://box.lan:3000",
  "TRUSTED_ORIGINS=http://box.lan:3000",
  "BETTER_AUTH_SECRET=keep-me",
  "PROVIDER_ENCRYPTION_KEY=keep-me-too",
  "POSTGRES_PASSWORD=pw",
  "AVEN_REGISTRATION=open",
  "PLATFORM_OWNER_EMAILS=old@example.com",
  "TAVILY_API_KEY=tvly",
  "",
].join("\n");

async function installWith(argv: string[], plan: Parameters<typeof planServer>[0]) {
  await writeFile(join(dir, ".env"), installed);
  const args = parseArgs(argv);
  const { options: planned } = planServer(plan);
  const result = await writeServerFiles(dir, files, planned, installEnvValues(args, planned));
  return { result, env: parseEnv(await readFile(join(dir, ".env"), "utf8")) };
}

test("writes the compose file and a new .env readable by its owner only", async () => {
  expect((await writeServerFiles(join(dir, "server"), files, options)).created).toBe(true);
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

  const result = await writeServerFiles(
    dir,
    { ...files, compose: "new" },
    { ...options, version: "2" },
  );
  expect(result).toEqual({ created: false, changed: [] });
  expect(await readFile(join(dir, ".env"), "utf8")).toBe(before);
  expect(await readFile(join(dir, "docker-compose.yml"), "utf8")).toBe("new");
});

test("a domain on an existing install changes what the install owns and keeps the rest", async () => {
  const { result, env } = await installWith(
    ["server", "install", "--domain=aven.example.com", "--owner-email=me@example.com"],
    { release: "1.0.0", domain: "aven.example.com", ownerEmail: "me@example.com" },
  );

  expect(result.created).toBe(false);
  expect(env.AVEN_SITE_ADDRESS).toBe("aven.example.com");
  expect(env.AVEN_HTTPS_PORT).toBe("443");
  expect(env.AVEN_HTTPS_BIND).toBe("0.0.0.0");
  expect(env.AVEN_BIND).toBe("0.0.0.0");
  expect(env.AVEN_PORT).toBe("80");
  expect(env.BETTER_AUTH_URL).toBe("https://aven.example.com");
  expect(env.TRUSTED_ORIGINS).toBe("https://aven.example.com");
  expect(env.AVEN_REGISTRATION).toBe("open");
  expect(env.PLATFORM_OWNER_EMAILS).toBe("me@example.com");

  expect(env.AVEN_VERSION).toBe("0.9.0");
  expect(env.AVEN_API_PORT).toBe("2900");
  expect(env.BETTER_AUTH_SECRET).toBe("keep-me");
  expect(env.PROVIDER_ENCRYPTION_KEY).toBe("keep-me-too");
  expect(env.POSTGRES_PASSWORD).toBe("pw");
  expect(env.TAVILY_API_KEY).toBe("tvly");
  expect((await stat(join(dir, ".env"))).mode & 0o777).toBe(0o600);

  const lines = envChangeLines(result.changed);
  expect(lines).toContain("AVEN_SITE_ADDRESS: :80 -> aven.example.com");
  expect(lines).toContain("AVEN_HTTPS_PORT: 2838 -> 443");
  expect(lines).toContain("AVEN_PORT: 3000 -> 80");
  expect(lines).toContain("BETTER_AUTH_URL: http://box.lan:3000 -> https://aven.example.com");
  const keys = result.changed.map((change) => change.key);
  expect(keys).not.toContain("AVEN_REGISTRATION");
  expect(keys).not.toContain("AVEN_API_PORT");
  expect(keys).not.toContain("AVEN_VERSION");
  expect(keys).not.toContain("BETTER_AUTH_SECRET");
});

test("an install with no flags leaves an existing .env as it is", async () => {
  const { result, env } = await installWith(["server", "install"], { release: "1.0.0" });

  expect(result.changed).toEqual([]);
  expect(parseEnv(await readFile(join(dir, ".env"), "utf8"))).toEqual({
    ...parseEnv(installed),
    COMPOSE_PROJECT_NAME: "aven",
  });
  expect(env.AVEN_PORT).toBe("3000");
  expect(env.AVEN_BIND).toBe("100.64.0.7");
});

test("a flag changes the key it names and leaves the address people open", async () => {
  const { result, env } = await installWith(["server", "install", "--api-port=2901"], {
    release: "1.0.0",
  });

  expect(result.changed).toEqual([{ key: "AVEN_API_PORT", from: "2900", to: "2901" }]);
  expect(env.AVEN_API_PORT).toBe("2901");
  expect(env.BETTER_AUTH_URL).toBe("http://box.lan:3000");
  expect(env.AVEN_SITE_ADDRESS).toBe(":80");
});

test("--browser-origin sets the origin the Browser of a thread is served at, and nothing else", async () => {
  const { result, env } = await installWith(
    ["server", "install", "--browser-origin=https://box.lan:8444"],
    { release: "1.0.0" },
  );

  expect(result.changed).toEqual([
    { key: "AVEN_BROWSER_ORIGIN", from: undefined, to: "https://box.lan:8444" },
  ]);
  expect(env.AVEN_BROWSER_ORIGIN).toBe("https://box.lan:8444");
  expect(env.BETTER_AUTH_URL).toBe("http://box.lan:3000");
});

test("--origin moves the address people open, both where the browser goes and what is trusted", async () => {
  const { result, env } = await installWith(
    ["server", "install", "--port=3100", "--origin=https://aven.example.com"],
    { release: "1.0.0", port: "3100", origin: "https://aven.example.com" },
  );

  expect(env.AVEN_PORT).toBe("3100");
  expect(env.BETTER_AUTH_URL).toBe("https://aven.example.com");
  expect(env.TRUSTED_ORIGINS).toBe("https://aven.example.com");
  expect(env.AVEN_SITE_ADDRESS).toBe(":80");
  expect(result.changed.map((change) => change.key).sort()).toEqual([
    "AVEN_PORT",
    "BETTER_AUTH_URL",
    "TRUSTED_ORIGINS",
  ]);
});

test("a key an older .env lacks is added, and the output says it was unset", async () => {
  await writeFile(join(dir, ".env"), "AVEN_PORT=3000\nBETTER_AUTH_SECRET=keep-me\n");
  const args = parseArgs(["server", "install", "--bind=0.0.0.0", "--owner-email=me@example.com"]);
  const { options: planned } = planServer({
    release: "1.0.0",
    bind: "0.0.0.0",
    ownerEmail: "me@example.com",
  });
  const result = await writeServerFiles(dir, files, planned, installEnvValues(args, planned));

  const env = parseEnv(await readFile(join(dir, ".env"), "utf8"));
  expect(env.AVEN_BIND).toBe("0.0.0.0");
  expect(env.AVEN_REGISTRATION).toBeUndefined();
  expect(env.BETTER_AUTH_SECRET).toBe("keep-me");
  expect(env.AVEN_PORT).toBe("3000");
  expect(envChangeLines(result.changed)).toContain("AVEN_BIND: unset -> 0.0.0.0");
});
