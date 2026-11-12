import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const API_PORT = 8220;
const WEB_PORT = 5286;
const API = `http://127.0.0.1:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const TOKEN = "sk-ant-oat01-e2e-claude-setup-9f3a";
const PROMPT = "Say which backend is answering";
const REPLY = "The Claude backend is answering this thread.";

function agentDatabaseUrl() {
  const from =
    process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/aven_e2e";
  const url = new URL(from);
  const name = `aven_claude_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}_e2e`;
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

async function journalHas(home: string, text: string) {
  const parts = await Promise.all(
    ["runs.db", "runs.db-wal", "runs.db.state", "runs.db.state-wal"].map((name) =>
      readFile(join(home, name)).then(
        (bytes) => bytes,
        () => Buffer.alloc(0),
      ),
    ),
  );
  return Buffer.concat(parts).includes(Buffer.from(text));
}

test.describe("a thread on the Claude backend", () => {
  test.describe.configure({ timeout: 120_000 });

  const databaseUrl = agentDatabaseUrl();
  const localToken = `avrt_${randomBytes(24).toString("hex")}`;
  let hostHome = "";
  let machineHome = "";
  let folder = "";
  const procs: Proc[] = [];

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    hostHome = await realpath(await mkdtemp(join(tmpdir(), "aven-claude-host-")));
    machineHome = await realpath(await mkdtemp(join(tmpdir(), "aven-claude-machine-")));
    folder = await realpath(await mkdtemp(join(tmpdir(), "aven-claude-folder-")));
    const setup = spawn("bun", ["e2e/setup-agent-db.ts"], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    });

    if ((await new Promise((resolve) => setup.once("exit", resolve))) !== 0) {
      throw new Error("could not prepare the Claude e2e database");
    }

    const api = start("bun", ["apps/control-plane/src/index.ts"], {
      ...process.env,
      PORT: String(API_PORT),
      DATABASE_URL: databaseUrl,
      AVEN_RUNTIME_HOME: hostHome,
      BETTER_AUTH_SECRET: "kQ8vZ3mR7xT1pL9wY4nB6cD2fH5jS0aG",
      BETTER_AUTH_URL: WEB,
      TRUSTED_ORIGINS: WEB,
      AGENT_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "",
      PROVIDER_ENCRYPTION_KEY: "ZTJlLW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE=",
      MODEL_CATALOG_URL: "",
      AVEN_LOCAL_RUNNER: "on",
      AVEN_LOCAL_RUNNER_TOKEN: localToken,
      AVEN_VERSION: "9.9.9",
      AVEN_RELEASES_URL: "http://127.0.0.1:9/releases",
      PROVIDER_ALLOWED_HOSTS: "localhost,127.0.0.1",
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
      [hostHome, machineHome, folder]
        .filter(Boolean)
        .map((dir) => rm(dir, { recursive: true, force: true })),
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

  test("a person saves a setup token and a Claude thread runs on that backend", async ({
    page,
  }) => {
    await register(page);
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
      AVEN_CLAUDE_FAKE: "1",
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

    await page.goto(`${WEB}/settings/claude`);
    const tokenField = page.getByRole("textbox", { name: "Claude setup token" });
    await tokenField.fill(TOKEN);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Claude setup token saved")).toBeVisible();
    await expect(tokenField).toHaveAttribute("placeholder", "Saved, ending in 9f3a");
    await expect(page.getByText(TOKEN)).toHaveCount(0);

    await page.goto(`${WEB}/threads?project=${project.id}`);
    await page.getByRole("button", { name: "Model and reasoning effort" }).click();
    await page.getByRole("option", { name: "Default" }).first().click();
    await expect(page.getByRole("button", { name: "Model and reasoning effort" })).toContainText(
      "Claude Default",
    );
    await expect(page.getByText("Set a Claude setup token")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Prompt" }).fill(PROMPT);
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await expect(page.getByText(REPLY)).toBeVisible({ timeout: 45_000 });
    await expect(page.getByRole("combobox", { name: "Claude model" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Working" })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(TOKEN)).toHaveCount(0);

    expect(await journalHas(machineHome, PROMPT)).toBe(true);
    expect(await journalHas(hostHome, PROMPT)).toBe(false);
  });
});

async function register(page: Page) {
  const email = `claude-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;
  await page.goto(`${WEB}/register`);
  await page.getByLabel("Name").fill("Claude Person");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
}
