import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { fakeRunnerProcessEnv } from "./fake-runner-config";
import {
  addRunner,
  connectGithub,
  registerUser,
  seedGithubProject,
  tempRuntimeHome,
} from "./helpers";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:8100";

function runGit(cwd: string, args: string[]) {
  const res = spawnSync("git", args, { cwd, encoding: "utf8" });
  expect(res.status, res.stderr).toBe(0);
}

function createRealRepo() {
  const parent = mkdtempSync(join(tmpdir(), "aven-e2e-gitcenter-"));
  const repo = join(parent, "demo-repo");
  mkdirSync(repo, { recursive: true });
  runGit(repo, ["init", "-b", "main"]);
  runGit(repo, ["config", "user.name", "E2E Tester"]);
  runGit(repo, ["config", "user.email", "e2e@aven.test"]);
  writeFileSync(join(repo, "README.md"), "# Demo Repo\n");
  runGit(repo, ["add", "README.md"]);
  runGit(repo, ["commit", "-m", "Initial demo commit"]);

  runGit(repo, ["branch", "old-merged"]);
  runGit(repo, ["checkout", "-b", "feat/demo"]);
  writeFileSync(join(repo, "app.ts"), "export const version = 1;\n");
  runGit(repo, ["add", "app.ts"]);
  runGit(repo, ["commit", "-m", "Add app module"]);

  writeFileSync(join(repo, "app.ts"), "export const version = 2;\n");
  return { parent, repo };
}

async function startRunnerWithDir(page: Page, dir: string) {
  const created = await page.request.post("/api/runtimes", { data: { name: "git runner" } });
  expect(created.ok()).toBe(true);
  const { runtime, token } = (await created.json()) as { runtime: { id: string }; token: string };
  const child = spawn("bun", ["e2e/fake-runner.ts"], {
    env: fakeRunnerProcessEnv(
      {
        ...process.env,
        AVEN_RUNTIME_HOME: tempRuntimeHome(),
        AVEN_URL: API_URL,
        AVEN_RUNTIME_TOKEN: token,
      },
      { FAKE_DIRS: dir },
    ),
  });
  await expect(async () => {
    const list = (await (await page.request.get("/api/runtimes")).json()) as {
      id: string;
      online: boolean;
    }[];
    expect(list.find((entry) => entry.id === runtime.id)?.online).toBe(true);
  }).toPass({ timeout: 10_000 });
  return { child, runtimeId: runtime.id };
}

test.describe("Git Center", () => {
  let runner: ChildProcess | undefined;
  let tempDir: string | undefined;

  test.afterEach(() => {
    runner?.kill();
    runner = undefined;

    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  test("renders live multi-branch graph, inspects commits, commits WIP, creates branches, shows reflog, and cleans merged branches", async ({
    page,
  }) => {
    await registerUser(page, "gitc", "Git Center User");
    const { parent, repo } = createRealRepo();
    tempDir = parent;

    const started = await startRunnerWithDir(page, parent);
    runner = started.child;

    const added = await page.request.post("/api/projects/folder", {
      data: { runtimeId: started.runtimeId, path: repo, name: "demo-repo" },
    });
    expect(added.ok(), await added.text()).toBe(true);
    const project = (await added.json()) as { id: string };

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/git/${project.id}`);

    await expect(page.getByText("Live Runner")).toBeVisible();
    await expect(page.getByText("Add app module")).toBeVisible();
    await expect(page.getByText("Initial demo commit")).toBeVisible();
    await expect(page.getByText("Working Tree (feat/demo)")).toBeVisible();

    await page.getByText("Add app module").click();
    await expect(page.getByText("export const version = 1;")).toBeVisible();

    await page.getByText("Working Tree (feat/demo)").click();
    await expect(page.getByText("app.ts").first()).toBeVisible();
    await page.getByRole("button", { name: "Stage all" }).click();
    await expect(page.getByText("Staged (1)")).toBeVisible();

    await page
      .getByPlaceholder("Commit summary (e.g. feat: add git center)")
      .fill("Bump version to 2");
    await page.getByRole("button", { name: "Commit", exact: true }).click();
    await expect(page.getByText("Bump version to 2")).toBeVisible();

    await page.getByRole("button", { name: "Branch", exact: true }).click();
    const branchDialog = page.getByRole("dialog", { name: "Create branch" });
    await branchDialog.getByPlaceholder("feat/my-branch").fill("feat/e2e-branch");
    await branchDialog.getByRole("button", { name: "Create branch" }).click();
    await expect(page.getByText("feat/e2e-branch").first()).toBeVisible();

    await page.getByRole("button", { name: "Undo / Reflog" }).click();
    const reflogDialog = page.getByRole("dialog", { name: "Undo / Reflog Recovery" });
    await expect(reflogDialog.getByText("HEAD@{0}")).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /Cleanup/ }).click();
    const cleanupDialog = page.getByRole("dialog", { name: "Branch & Worktree Cleanup" });
    await expect(cleanupDialog.getByText("old-merged")).toBeVisible();
    await cleanupDialog.getByRole("button", { name: /Delete 1 branch/ }).click();
    await expect(page.locator("aside").getByText("old-merged")).toHaveCount(0);
  });

  test("falls back cleanly to read-only GitHub mode when project has no online runner checkout", async ({
    page,
  }) => {
    await registerUser(page, "gitro", "Git Fallback User");
    await addRunner(page);
    await connectGithub(page);
    const project = await seedGithubProject(page, "shiny-app", "first");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/git/${project.id}`);

    await expect(page.getByText("Read-only · GitHub")).toBeVisible();
    await expect(page.getByText("Change number 14")).toBeVisible();
    await expect(page.getByText("Working tree unavailable in read-only mode")).toBeVisible();
  });
});
