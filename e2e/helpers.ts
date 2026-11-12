import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, type Page } from "@playwright/test";

import { fakeRunnerProcessEnv } from "./fake-runner-config";

export async function registerUser(page: Page, prefix: string, name = "E2E User") {
  const email = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@aven.test`;
  await page.goto("/register");
  const nameField = page.getByLabel("Name");
  await expect(nameField).toBeVisible();
  await expect(nameField).toBeEnabled();
  await nameField.fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
  return email;
}

export async function addRunner(page: Page) {
  const response = await page.request.post("/api/runtimes", { data: { name: "runner" } });
  expect(response.ok()).toBe(true);
}

export async function setDecisionModel(page: Page) {
  const saved = await page.request.put("/api/decision-model", {
    data: { kind: "jev-openrouter", apiKey: "sk-or-test-0000" },
  });
  expect(saved.ok()).toBe(true);
}

export async function connectGithub(page: Page) {
  const response = await page.request.get("/api/github");
  const { installUrl } = (await response.json()) as { installUrl: string };
  const state = new URL(installUrl).searchParams.get("state")!;
  const callback = `/api/github/callback?installation_id=1&code=fake&state=${encodeURIComponent(state)}`;
  await page.goto(callback);
  await expect(page).toHaveURL(/\/projects\?github=connected$/);
}

export async function importRepository(page: Page, name: string) {
  const installations = (await (await page.request.get("/api/github/installations")).json()) as {
    id: string;
  }[];
  const runtimes = (await (await page.request.get("/api/runtimes")).json()) as { id: string }[];
  const created = await page.request.post("/api/projects", {
    data: {
      installationId: installations[0]!.id,
      repository: `acme/${name}`,
      runtimeId: runtimes.at(-1)!.id,
    },
  });
  expect(created.ok()).toBe(true);
  const project = (await created.json()) as { id: string };
  const here = new URL(page.url());

  if (here.pathname === "/threads") await page.goto(`/threads?project=${project.id}`);
  else await page.reload();

  await page.waitForLoadState("networkidle");
}

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8100";

export function tempRuntimeHome() {
  return mkdtempSync(join(tmpdir(), "aven-e2e-runner-"));
}

export async function threadOnFakeRunner(page: Page, env: Record<string, string> = {}) {
  const created = await page.request.post("/api/runtimes", { data: { name: "fake runner" } });
  const { runtime, token } = (await created.json()) as { runtime: { id: string }; token: string };
  const child = spawn("bun", ["e2e/fake-runner.ts"], {
    env: fakeRunnerProcessEnv(
      {
        ...process.env,
        AVEN_RUNTIME_HOME: tempRuntimeHome(),
        AVEN_URL: API_URL,
        AVEN_RUNTIME_TOKEN: token,
      },
      env,
    ),
  });
  const events: { type: string; [key: string]: unknown }[] = [];
  child.stdout.on("data", (chunk: Buffer) => {
    for (const line of String(chunk).split("\n")) {
      if (line.startsWith("EVENT ")) events.push(JSON.parse(line.slice(6)));
    }
  });
  await expect(async () => {
    const list = (await (await page.request.get("/api/runtimes")).json()) as {
      id: string;
      online: boolean;
    }[];
    expect(list.find((entry) => entry.id === runtime.id)?.online).toBe(true);
  }).toPass({ timeout: 10_000 });

  await connectGithub(page);
  await importRepository(page, "shiny-app");
  const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
  const made = await page.request.post("/api/threads", { data: { projectId: projects[0]!.id } });
  const thread = (await made.json()) as { id: string };
  return { child, events, threadId: thread.id };
}

export async function registerPlatformOwner(page: Page, index: number) {
  const email = (process.env.E2E_PLATFORM_OWNERS ?? "").split(",")[index];

  if (!email) throw new Error(`There is no platform owner number ${index}`);

  await page.goto("/register");
  await page.getByLabel("Name").fill(`Platform Owner ${index}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/threads$/);
  return email;
}
