import { expect, test, type Page } from "@playwright/test";

import { addRunner, connectGithub, registerUser } from "./helpers";

// The fake GitHub (e2e/fake-github.ts) has a repository with folders and a README, and one,
// composer-app, with no README.
async function projectOf(page: Page, name: string) {
  await addRunner(page);
  await connectGithub(page);
  const [installation] = await (await page.request.get("/api/github/installations")).json();
  const [runtime] = await (await page.request.get("/api/runtimes")).json();
  const response = await page.request.post("/api/projects", {
    data: { installationId: installation.id, repository: `acme/${name}`, runtimeId: runtime.id },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()) as { id: string };
}

// A project's page is a repository's (decision 0082): its files and its README beside what is about
// the project.
test.describe("the project page", () => {
  test("lists the repository's folders and files, and shows its README", async ({ page }) => {
    await registerUser(page, "repo", "Repo Person");
    const project = await projectOf(page, "shiny-app");
    await page.goto(`/projects/${project.id}`);

    // The README has a heading of its own, also named after the repository: the title comes first.
    await expect(page.getByRole("heading", { name: "shiny-app", level: 1 }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "acme/shiny-app" })).toHaveAttribute(
      "href",
      "https://github.com/acme/shiny-app",
    );

    // Folders first, then files, each by name; a file is read on GitHub.
    const files = page.getByRole("region", { name: "Files" });
    await expect(files.getByRole("link")).toHaveText([
      "shiny-app",
      "docs",
      "src",
      "package.json",
      "README.md",
    ]);
    await expect(files.getByRole("link", { name: "package.json" })).toHaveAttribute(
      "href",
      "https://github.com/acme/shiny-app/blob/main/package.json",
    );

    // The README, whose relative link now points into the repository on GitHub.
    const readme = page.getByRole("region", { name: "README" });
    await expect(readme.getByRole("heading", { name: "shiny-app" })).toBeVisible();
    await expect(readme.getByRole("link", { name: "the guide" })).toHaveAttribute(
      "href",
      "https://github.com/acme/shiny-app/blob/main/docs/guide.md",
    );

    // What is about the project is beside it.
    await expect(page.getByRole("region", { name: "About" })).toContainText("main");
    await expect(page.getByRole("region", { name: "Recent threads" })).toBeVisible();
    await expect(page.getByText("Environment variables")).toBeVisible();
  });

  test("lists the latest commits ten to a page, newest first, and pages back and forward", async ({
    page,
  }) => {
    await registerUser(page, "repo", "Repo Person");
    const project = await projectOf(page, "shiny-app");
    await page.goto(`/projects/${project.id}`);

    const commits = page.getByRole("region", { name: "Commits" });
    const rows = commits.getByRole("listitem");
    await expect(rows).toHaveCount(10);
    // The first line of the message and who wrote it; the body is not shown.
    await expect(rows.first()).toContainText("Change number 14");
    await expect(rows.first()).toContainText("Ada Lovelace");
    await expect(commits.getByText("Why it changed")).toHaveCount(0);
    await expect(rows.last()).toContainText("Change number 5");
    await expect(
      commits.getByRole("link", { name: "Open commit 14abcde on GitHub" }),
    ).toHaveAttribute(
      "href",
      "https://github.com/acme/shiny-app/commit/14abcdef0123456789abcdef0123456789abcdef",
    );

    // The branches that end on a commit are named beside it: main on the newest, and the branch the
    // merge brought in on its own head (commit 10, the fifth row).
    await expect(rows.first().getByText("main", { exact: true })).toBeVisible();
    await expect(rows.nth(4).getByText("feature/login")).toBeVisible();
    await expect(rows.nth(3).getByText("feature/login")).toHaveCount(0);

    // The graph: two lanes wide for every row, since the merge (commit 12, the third row) opens a
    // second lane that comes back at commit 9. The newest commit has one line, down; the merge has
    // one from above and two down; and the dot of each row is there.
    await expect(rows.first().locator("svg[data-slot=commit-graph]")).toHaveAttribute(
      "width",
      "32",
    );
    await expect(rows.nth(1).locator("svg[data-slot=commit-graph]")).toHaveAttribute("width", "32");
    await expect(rows.first().locator("svg[data-slot=commit-graph] path")).toHaveCount(1);
    await expect(rows.nth(2).locator("svg[data-slot=commit-graph] path")).toHaveCount(3);
    await expect(commits.locator("svg[data-slot=commit-graph] circle")).toHaveCount(10);

    // Newest first: no newer page to go to, and an older one.
    await expect(commits.getByText("Page 1")).toBeVisible();
    await expect(commits.getByRole("button", { name: "Newer" })).toBeDisabled();
    await commits.getByRole("button", { name: "Older" }).click();

    await expect(commits.getByText("Page 2")).toBeVisible();
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText("Change number 4");
    await expect(commits.getByRole("button", { name: "Older" })).toBeDisabled();

    await commits.getByRole("button", { name: "Newer" }).click();
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toContainText("Change number 14");
  });

  test("lists the pull requests and issues with their status, open or closed, ten to a page", async ({
    page,
  }) => {
    await registerUser(page, "tracked", "Tracked Person");
    const project = await projectOf(page, "shiny-app");
    await page.goto(`/projects/${project.id}`);

    const card = page.getByRole("region", { name: "Pull requests and issues" });
    const rows = card.getByRole("listitem");

    // Open pull requests first, the latest changed on top, the newest of them a draft.
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toContainText("Open pull request 12");
    await expect(rows.first()).toContainText("Draft");
    await expect(rows.first()).toContainText("#100 · ada");
    await expect(rows.first().getByLabel("3 comments")).toBeVisible();
    await expect(rows.nth(1)).toContainText("Open");
    await expect(rows.first().getByRole("link", { name: "Open pull request 12" })).toHaveAttribute(
      "href",
      "https://github.com/acme/web/pull/100",
    );
    await expect(card.getByText("Page 1 · 12 in all")).toBeVisible();
    await card.getByRole("button", { name: "Older" }).click();
    await expect(rows).toHaveCount(2);
    await expect(card.getByRole("button", { name: "Older" })).toBeDisabled();

    // Closed shows what was merged, from the first page again.
    await card.getByRole("button", { name: "Closed" }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Merged pull request");
    await expect(rows.first()).toContainText("Merged");
    await expect(rows.nth(1)).toContainText("Closed");
    await expect(card.getByRole("navigation", { name: "Pages" })).toHaveCount(0);

    // Issues are their own list, and an empty one says so.
    await card.getByRole("tab", { name: "Issues" }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Closed issue");
    await card.getByRole("button", { name: "Open", exact: true }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("Open issue two");
  });

  test("the person who imported a project moves it to another runner", async ({ page }) => {
    await registerUser(page, "mover", "Mover Person");
    const project = await projectOf(page, "shiny-app");
    const second = await page.request.post("/api/runtimes", { data: { name: "second" } });
    expect(second.ok()).toBe(true);
    await page.goto(`/projects/${project.id}`);

    const runner = page.getByRole("combobox", { name: "Runner" });
    await expect(runner).toContainText("runner");
    await expect(page.getByText("Threads already started stay on their runner.")).toBeVisible();
    await runner.click();
    await page.getByRole("option", { name: "second · offline" }).click();

    await expect(page.getByText("Runner changed")).toBeVisible();
    await expect(runner).toContainText("second");
    const moved = await (await page.request.get(`/api/projects/${project.id}`)).json();
    const secondId = (await second.json()).runtime.id;
    expect(moved.runtimeId).toBe(secondId);

    // A thread started now runs on the new runner.
    const made = await page.request.post("/api/threads", { data: { projectId: project.id } });
    expect(made.ok()).toBe(true);
    expect((await made.json()).runtimeId).toBe(secondId);
  });

  test("deleting a project hides it, archives its threads and lets the repository be imported again", async ({
    page,
  }) => {
    await registerUser(page, "deleter", "Deleter Person");
    const project = await projectOf(page, "shiny-app");
    const made = await page.request.post("/api/threads", { data: { projectId: project.id } });
    const thread = (await made.json()) as { id: string };
    const variable = await page.request.put(`/api/projects/${project.id}/variables/API_URL`, {
      data: { value: "https://example.test", secret: false },
    });
    expect(variable.ok()).toBe(true);
    await page.goto(`/projects/${project.id}`);

    // Nothing goes before the person says so.
    await page.getByRole("button", { name: "Delete project" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Delete shiny-app?");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(200);

    await page.getByRole("button", { name: "Delete project" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete project" }).click();

    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText("Project deleted")).toBeVisible();
    // Gone from the API and the list; its thread is kept, archived.
    expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(404);
    const listed = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
    expect(listed.map((entry) => entry.id)).not.toContain(project.id);
    const kept = await (await page.request.get(`/api/threads/${thread.id}`)).json();
    expect(kept.state).toBe("archived");
    // Nobody can send to it any more.
    const sent = await page.request.post(`/api/threads/${thread.id}/messages`, {
      data: { prompt: "hello" },
    });
    expect(sent.status()).toBe(409);

    // The repository comes back as a project of its own.
    const [installation] = await (await page.request.get("/api/github/installations")).json();
    const [runtime] = await (await page.request.get("/api/runtimes")).json();
    const again = await page.request.post("/api/projects", {
      data: {
        installationId: installation.id,
        repository: "acme/shiny-app",
        runtimeId: runtime.id,
      },
    });
    expect(again.ok()).toBe(true);
    expect(((await again.json()) as { id: string }).id).not.toBe(project.id);
  });

  test("a folder opens in place, with a way back, and shows no README of its own", async ({
    page,
  }) => {
    await registerUser(page, "repo", "Repo Person");
    const project = await projectOf(page, "shiny-app");
    await page.goto(`/projects/${project.id}`);

    const files = page.getByRole("region", { name: "Files" });
    await files.getByRole("link", { name: "src" }).click();
    await expect(page).toHaveURL(/\/projects\/[\w-]+\?path=src$/);
    await expect(files.getByRole("link", { name: "index.ts" })).toBeVisible();
    await expect(files.getByRole("navigation", { name: "Folder" })).toContainText("src");
    await expect(page.getByRole("region", { name: "README" })).toHaveCount(0);

    // The folder is part of the address, so it is there after a reload.
    await page.reload();
    await expect(files.getByRole("link", { name: "index.ts" })).toBeVisible();

    await files.getByRole("link", { name: ".." }).click();
    await expect(page).toHaveURL(/\/projects\/[\w-]+$/);
    await expect(files.getByRole("link", { name: "docs" })).toBeVisible();
    await expect(page.getByRole("region", { name: "README" })).toBeVisible();
  });

  test("Start thread opens the new-thread page with this project chosen", async ({ page }) => {
    await registerUser(page, "repo", "Repo Person");
    await projectOf(page, "shiny-app");
    // A second project, so that the choice cannot be the only one there is.
    const [installation] = await (await page.request.get("/api/github/installations")).json();
    const [runtime] = await (await page.request.get("/api/runtimes")).json();
    const docs = await page.request.post("/api/projects", {
      data: {
        installationId: installation.id,
        repository: "acme/docs-site",
        runtimeId: runtime.id,
      },
    });
    const { id } = (await docs.json()) as { id: string };

    await page.goto(`/projects/${id}`);
    await page.getByRole("button", { name: "Start thread" }).click();
    await expect(page).toHaveURL(new RegExp(`/threads\\?project=${id}$`));
    await expect(page.getByRole("combobox", { name: "Project" })).toContainText("docs-site");

    await page.getByRole("textbox", { name: "Prompt" }).fill("Look at the docs");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/threads\/[0-9a-f-]{36}$/);
    await page.goto(`/projects/${id}`);
    await expect(page.getByRole("region", { name: "Recent threads" })).toContainText(
      "Look at the docs",
    );
  });

  test("a project in the new-thread address that is not the person's is not chosen", async ({
    page,
  }) => {
    await registerUser(page, "repo", "Repo Person");
    await projectOf(page, "shiny-app");
    await page.goto(`/threads?project=${crypto.randomUUID()}`);
    await expect(page.getByRole("combobox", { name: "Project" })).toContainText("Choose a project");
  });

  test("a repository with no README has no README section, and a path that is not a folder says so", async ({
    page,
  }) => {
    await registerUser(page, "repo", "Repo Person");
    const project = await projectOf(page, "composer-app");
    await page.goto(`/projects/${project.id}`);
    await expect(
      page.getByRole("region", { name: "Files" }).getByRole("link", { name: "src" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "README" })).toHaveCount(0);

    await page.goto(`/projects/${project.id}?path=nothing-here`);
    await expect(page.getByText("Could not read this repository on GitHub")).toBeVisible();
  });

  test("another organization's project is not found, and nothing of it is read", async ({
    page,
    browser,
  }) => {
    await registerUser(page, "repo", "Repo Person");
    const project = await projectOf(page, "shiny-app");

    const other = await browser.newPage();
    await registerUser(other, "stranger", "Stranger");
    expect((await other.request.get(`/api/projects/${project.id}/files`)).status()).toBe(404);
    expect((await other.request.get(`/api/projects/${project.id}/readme`)).status()).toBe(404);
    // A path that climbs out of the repository is refused before GitHub is asked.
    expect((await page.request.get(`/api/projects/${project.id}/files?path=..`)).status()).toBe(
      422,
    );
    await other.close();
  });
});
