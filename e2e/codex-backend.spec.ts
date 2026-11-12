import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const CODEX_FAKE_REPLY = "The Codex backend is answering this thread.";

const API_PORT = 8230;
const WEB_PORT = 5292;
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const TOKEN = "eyJhbGciOiJub25lIn0.codex-e2e-signature";

function agentDatabaseUrl() {
  const from =
    process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/aven_e2e";
  const url = new URL(from);
  const name = `aven_codex_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}_e2e`;
  url.pathname = `/${name}`;
  return url.toString();
}

type Proc = { child: ChildProcess; output: () => string };

function start(command: string, args: string[], env: NodeJS.ProcessEnv): Proc {
  const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  const take = (chunk: Buffer) => {
    log += chunk.toString();

    if (log.length > 24_000) log = log.slice(-24_000);
  };
  child.stdout?.on("data", take);
  child.stderr?.on("data", take);
  return { child, output: () => log };
}

async function stop(proc: Proc | undefined) {
  if (!proc || proc.child.exitCode !== null) return;

  proc.child.kill("SIGTERM");
  await new Promise((resolve) => proc.child.once("exit", resolve));
}

async function untilUp(url: string, proc: Proc) {
  const deadline = Date.now() + 40_000;
  let last = "not started";
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null) {
      throw new Error(`${url} exited ${proc.child.exitCode}\n${proc.output()}`);
    }

    try {
      const response = await fetch(url);

      if (response.ok) return;

      last = String(response.status);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${url} did not come up (${last})\n${proc.output()}`);
}

async function treeHas(dir: string, text: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (await treeHas(path, text)) return true;

      continue;
    }

    const bytes = await readFile(path).catch(() => Buffer.alloc(0));

    if (bytes.includes(Buffer.from(text))) return true;
  }

  return false;
}

test.describe("a thread on the Codex backend", () => {
  test.describe.configure({ timeout: 120_000 });

  const databaseUrl = agentDatabaseUrl();
  let machineHome = "";
  let folder = "";
  const procs: Proc[] = [];

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    machineHome = await realpath(await mkdtemp(join(tmpdir(), "aven-codex-machine-")));
    folder = await realpath(await mkdtemp(join(tmpdir(), "aven-codex-folder-")));
    const setup = spawn("bun", ["e2e/setup-agent-db.ts"], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    });

    if ((await new Promise((resolve) => setup.once("exit", resolve))) !== 0) {
      throw new Error("could not prepare the Codex database");
    }

    const api = start("bun", ["apps/control-plane/src/index.ts"], {
      ...process.env,
      PORT: String(API_PORT),
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: "kQ8vZ3mR7xT1pL9wY4nB6cD2fH5jS0aG",
      BETTER_AUTH_URL: WEB,
      TRUSTED_ORIGINS: WEB,
      PROVIDER_ENCRYPTION_KEY: "ZTJlLW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=",
      MODEL_CATALOG_URL: "",
      AVEN_LOCAL_RUNNER: "off",
      AVEN_VERSION: "9.9.9",
      AVEN_RELEASES_URL: "http://127.0.0.1:9/releases",
    });
    procs.push(api);
    await untilUp(`${API}/health`, api);

    const web = start("bun", ["run", "--cwd", "apps/platform", "preview"], {
      ...process.env,
      WEB_PORT: String(WEB_PORT),
      API_URL: API,
    });
    procs.push(web);
    await untilUp(WEB, web);
  });

  test.afterAll(async () => {
    for (const proc of [...procs].reverse()) await stop(proc);
    await Promise.all(
      [machineHome, folder].filter(Boolean).map((dir) => rm(dir, { recursive: true, force: true })),
    );
    const drop = spawn("bun", ["e2e/setup-agent-db.ts", "--drop"], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    });
    await new Promise((resolve) => drop.once("exit", resolve));
  });

  test.afterEach(async ({ page }, info) => {
    if (info.status === info.expectedStatus) return;

    console.log(page.url());
    for (const proc of procs) console.log(proc.output());
  });

  test("saves a ChatGPT login and a thread answers on Codex", async ({ page }) => {
    await register(page);
    await page.goto(`${WEB}/settings/codex`);
    await page.getByRole("textbox", { name: "ChatGPT login" }).fill(TOKEN);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`Saved, ending in ${TOKEN.slice(-4)}`)).toBeVisible();

    const created = await page.request.post(`${WEB}/api/runtimes`, { data: { name: "machine" } });
    const createdText = await created.text();
    expect(created.ok(), createdText).toBe(true);
    const { runtime, token } = JSON.parse(createdText) as {
      runtime: { id: string };
      token: string;
    };
    const machine = start("bun", ["apps/runtime/src/main.ts"], {
      ...process.env,
      AVEN_URL: API,
      AVEN_RUNTIME_TOKEN: token,
      AVEN_RUNTIME_HOME: machineHome,
      AVEN_DIRS: folder,
      AVEN_CODEX_FAKE: "1",
    });
    procs.push(machine);

    let served = "";
    await expect
      .poll(
        async () => {
          const response = await page.request.get(`${WEB}/api/runtimes`);
          const list = (await response.json()) as {
            id: string;
            online: boolean;
            directories: string[];
          }[];
          const row = list.find((entry) => entry.id === runtime.id);
          served = row?.directories[0] ?? "";
          return Boolean(row?.online && served);
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    const added = await page.request.post(`${WEB}/api/projects/folder`, {
      data: { runtimeId: runtime.id, path: served },
    });
    const addedText = await added.text();
    expect(added.ok(), addedText).toBe(true);
    const project = JSON.parse(addedText) as { id: string };

    await page.goto(`${WEB}/threads?project=${project.id}`);
    await page.getByLabel("Agent").selectOption("codex");
    await expect(page.getByText("Set a ChatGPT login in Settings")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Prompt" }).fill("Say hello from Codex");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect(page.getByText(CODEX_FAKE_REPLY)).toBeVisible({ timeout: 45_000 });
    expect(await treeHas(machineHome, TOKEN)).toBe(false);
    expect(machine.output()).not.toContain(TOKEN);
  });
});

async function register(page: Page) {
  const email = `codex-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;
  await page.goto(`${WEB}/register`);
  await page.getByLabel("Name").fill("Codex Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
}
