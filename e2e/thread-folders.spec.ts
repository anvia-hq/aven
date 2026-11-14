import type { ChildProcess } from "node:child_process";

import { expect, test, type Page, type Route } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const QUICK = { timeout: 700 };

async function startWithThreads(page: Page) {
  await registerUser(page, "fld", "Folder User");
  const { child, threadId } = await threadOnFakeRunner(page);
  const projects = (await (await page.request.get("/api/projects")).json()) as { id: string }[];
  await page.request.patch(`/api/threads/${threadId}`, { data: { title: "Gamma thread" } });
  for (const title of ["Alpha thread", "Beta thread"]) {
    const response = await page.request.post("/api/threads", {
      data: { projectId: projects[0]!.id },
    });
    const thread = (await response.json()) as { id: string };
    await page.request.patch(`/api/threads/${thread.id}`, { data: { title } });
  }
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto("/threads");
  await expect(threadLink(page, "Alpha thread")).toBeVisible();
  return { child, threadId };
}

const folderOf = (page: Page, name: string) => page.locator(`[data-folder="${name}"]`);
const threadLink = (page: Page, title: string) =>
  page.locator("[data-slot='sidebar-menu-button']", { hasText: title });

async function createFolder(page: Page, name: string) {
  await page.getByRole("button", { name: "New folder" }).click();
  const field = page.getByRole("textbox", { name: "Folder name" });
  await expect(field).toBeFocused();
  await field.fill(name);
  await field.press("Enter");
  await expect(folderOf(page, name)).toBeVisible();
  await expect(folderOf(page, name)).toHaveAttribute("data-pending", "false");
}

async function openFolderMenu(page: Page, name: string) {
  await folderOf(page, name).hover();
  await folderOf(page, name)
    .getByRole("button", { name: `Folder options for ${name}` })
    .click();
}

const slow = (page: Page) =>
  page.route("**/api/folders**", async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fallback();
  });

test.describe("thread folders", () => {
  let runner: ChildProcess | undefined;
  test.afterEach(() => {
    runner?.kill();
    runner = undefined;
  });

  test("a folder is made, named, filled by dragging, emptied by dragging, renamed and deleted", async ({
    page,
  }) => {
    const started = await startWithThreads(page);
    runner = started.child;

    await page.getByRole("button", { name: "New folder" }).click();
    const field = page.getByRole("textbox", { name: "Folder name" });
    await expect(field).toBeFocused();
    await field.press("Escape");
    await expect(page.locator("[data-slot='new-folder']")).toHaveCount(0);
    await expect(page.locator("[data-slot='folder']")).toHaveCount(0);

    await createFolder(page, "Work");
    const work = folderOf(page, "Work");
    await expect(work.getByText("Drop threads here")).toBeVisible();
    await expect(work.locator("[data-slot='folder-count']")).toHaveText("0");

    await threadLink(page, "Alpha thread").dragTo(work);
    await expect(work.getByRole("link", { name: "Alpha thread" })).toBeVisible();
    await expect(work.locator("[data-slot='folder-count']")).toHaveText("1");
    await expect(work.getByText("Drop threads here")).toHaveCount(0);
    await expect(
      page.locator("[data-slot='unfiled']").getByRole("link", { name: "Alpha thread" }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/threads$/);

    await threadLink(page, "Alpha thread").dragTo(page.locator("[data-slot='unfiled']"));
    await expect(work.getByRole("link", { name: "Alpha thread" })).toHaveCount(0);
    await expect(work.locator("[data-slot='folder-count']")).toHaveText("0");
    await expect(
      page.locator("[data-slot='unfiled']").getByRole("link", { name: "Alpha thread" }),
    ).toBeVisible();

    await threadLink(page, "Alpha thread").dragTo(work);
    await expect(work.locator("[data-slot='folder-count']")).toHaveText("1");

    await work.locator("[data-slot='folder-toggle']").click();
    await expect(work.locator("[data-slot='folder-toggle']")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(work.getByRole("link")).toHaveCount(0);
    await expect(work.locator("[data-slot='folder-count']")).toHaveText("1");

    await openFolderMenu(page, "Work");
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const renameField = page.getByRole("textbox", { name: "Folder name" });
    await expect(renameField).toBeFocused();
    await renameField.fill("Projects");
    await renameField.press("Enter");
    await expect(folderOf(page, "Projects")).toBeVisible();
    await expect(folderOf(page, "Work")).toHaveCount(0);

    await page.reload();
    const projects = folderOf(page, "Projects");
    await expect(projects).toBeVisible();
    await expect(projects).toHaveAttribute("data-open", "false");
    await expect(projects.locator("[data-slot='folder-count']")).toHaveText("1");
    await projects.locator("[data-slot='folder-toggle']").click();
    await expect(projects.getByRole("link", { name: "Alpha thread" })).toBeVisible();

    await openFolderMenu(page, "Projects");
    await page.getByRole("menuitem", { name: "Delete folder" }).click();
    await expect(folderOf(page, "Projects")).toHaveCount(0);
    await expect(
      page.locator("[data-slot='unfiled']").getByRole("link", { name: "Alpha thread" }),
    ).toBeVisible();
    await page.reload();
    await expect(threadLink(page, "Alpha thread")).toBeVisible();
    await expect(page.locator("[data-slot='folder']")).toHaveCount(0);
  });

  test("the Move to folder menu files a thread, makes a folder for it and takes it out", async ({
    page,
  }) => {
    const started = await startWithThreads(page);
    runner = started.child;
    await createFolder(page, "Later");

    await threadLink(page, "Beta thread").hover();
    await page.getByRole("button", { name: "Options for Beta thread" }).click();
    await page.getByRole("menuitem", { name: "Move to folder" }).click();
    await page.getByRole("menuitem", { name: "Later" }).click();
    await expect(folderOf(page, "Later").getByRole("link", { name: "Beta thread" })).toBeVisible();

    await threadLink(page, "Alpha thread").hover();
    await page.getByRole("button", { name: "Options for Alpha thread" }).click();
    await page.getByRole("menuitem", { name: "Move to folder" }).click();
    await page.getByRole("menuitem", { name: "New folder…" }).click();
    const field = page.getByRole("textbox", { name: "Folder name" });
    await expect(field).toBeFocused();
    await field.fill("Fresh");
    await field.press("Enter");
    await expect(folderOf(page, "Fresh").getByRole("link", { name: "Alpha thread" })).toBeVisible();
    await expect(folderOf(page, "Fresh").locator("[data-slot='folder-count']")).toHaveText("1");

    await threadLink(page, "Beta thread").hover();
    await page.getByRole("button", { name: "Options for Beta thread" }).click();
    await page.getByRole("menuitem", { name: "Move to folder" }).click();
    await page.getByRole("menuitem", { name: "Remove from folder" }).click();
    await expect(
      page.locator("[data-slot='unfiled']").getByRole("link", { name: "Beta thread" }),
    ).toBeVisible();

    await page.reload();
    await expect(folderOf(page, "Fresh").getByRole("link", { name: "Alpha thread" })).toBeVisible();
    await expect(folderOf(page, "Later").locator("[data-slot='folder-count']")).toHaveText("0");
  });

  test("every folder action shows at once, before the server answers", async ({ page }) => {
    const started = await startWithThreads(page);
    runner = started.child;
    await createFolder(page, "Base");
    await slow(page);

    await page.getByRole("button", { name: "New folder" }).click();
    const field = page.getByRole("textbox", { name: "Folder name" });
    await expect(field).toBeFocused(QUICK);
    await field.fill("Quick");
    await field.press("Enter");
    await expect(folderOf(page, "Quick")).toBeVisible(QUICK);
    await expect(folderOf(page, "Quick")).toHaveAttribute("data-pending", "true");
    await expect(folderOf(page, "Quick")).toHaveAttribute("data-pending", "false", {
      timeout: 10_000,
    });

    await threadLink(page, "Alpha thread").dragTo(folderOf(page, "Quick"));
    await expect(folderOf(page, "Quick").getByRole("link", { name: "Alpha thread" })).toBeVisible(
      QUICK,
    );
    await expect(folderOf(page, "Quick").locator("[data-slot='folder-count']")).toHaveText(
      "1",
      QUICK,
    );

    await threadLink(page, "Alpha thread").dragTo(page.locator("[data-slot='unfiled']"));
    await expect(folderOf(page, "Quick").getByRole("link")).toHaveCount(0, QUICK);
    await expect(
      page.locator("[data-slot='unfiled']").getByRole("link", { name: "Alpha thread" }),
    ).toBeVisible(QUICK);

    await threadLink(page, "Beta thread").hover();
    await page.getByRole("button", { name: "Options for Beta thread" }).click();
    await page.getByRole("menuitem", { name: "Move to folder" }).click();
    await page.getByRole("menuitem", { name: "Base" }).click();
    await expect(folderOf(page, "Base").getByRole("link", { name: "Beta thread" })).toBeVisible(
      QUICK,
    );

    await folderOf(page, "Base").locator("[data-slot='folder-toggle']").click();
    await expect(folderOf(page, "Base")).toHaveAttribute("data-open", "false", QUICK);

    await openFolderMenu(page, "Base");
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const rename = page.getByRole("textbox", { name: "Folder name" });
    await rename.fill("Basement");
    await rename.press("Enter");
    await expect(folderOf(page, "Basement")).toBeVisible(QUICK);

    await openFolderMenu(page, "Basement");
    await page.getByRole("menuitem", { name: "Delete folder" }).click();
    await expect(folderOf(page, "Basement")).toHaveCount(0, QUICK);
    await expect(
      page.locator("[data-slot='unfiled']").getByRole("link", { name: "Beta thread" }),
    ).toBeVisible(QUICK);
  });

  test("a server error puts the sidebar back and shows an error", async ({ page }) => {
    const started = await startWithThreads(page);
    runner = started.child;
    await createFolder(page, "Steady");
    await page.route("**/api/folders**", (route) =>
      route.request().method() === "GET"
        ? route.fallback()
        : route.fulfill({ status: 500, body: "Boom" }),
    );

    await openFolderMenu(page, "Steady");
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const rename = page.getByRole("textbox", { name: "Folder name" });
    await rename.fill("Shaky");
    await rename.press("Enter");
    await expect(page.getByText("Could not rename the folder")).toBeVisible();
    await expect(folderOf(page, "Steady")).toBeVisible();
    await expect(folderOf(page, "Shaky")).toHaveCount(0);

    await threadLink(page, "Alpha thread").dragTo(folderOf(page, "Steady"));
    await expect(page.getByText("Could not move the thread")).toBeVisible();
    await expect(folderOf(page, "Steady").locator("[data-slot='folder-count']")).toHaveText("0");
    await expect(
      page.locator("[data-slot='unfiled']").getByRole("link", { name: "Alpha thread" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "New folder" }).click();
    const field = page.getByRole("textbox", { name: "Folder name" });
    await field.fill("Ghost");
    await field.press("Enter");
    await expect(page.getByText("Could not create the folder")).toBeVisible();
    await expect(folderOf(page, "Ghost")).toHaveCount(0);

    await openFolderMenu(page, "Steady");
    await page.getByRole("menuitem", { name: "Delete folder" }).click();
    await expect(page.getByText("Could not delete the folder")).toBeVisible();
    await expect(folderOf(page, "Steady")).toBeVisible();
  });

  test("a folder that is still being created cannot be opened or closed, so no request has its temporary id", async ({
    page,
  }) => {
    const started = await startWithThreads(page);
    runner = started.child;
    const patched: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().includes("/api/folders/")) {
        patched.push(request.url());
      }
    });
    await slow(page);

    await page.getByRole("button", { name: "New folder" }).click();
    const field = page.getByRole("textbox", { name: "Folder name" });
    await field.fill("Pending");
    await field.press("Enter");
    await expect(folderOf(page, "Pending")).toHaveAttribute("data-pending", "true", QUICK);
    const toggle = folderOf(page, "Pending").locator("[data-slot='folder-toggle']");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(folderOf(page, "Pending")).toHaveAttribute("data-pending", "false");
    expect(patched).toEqual([]);
    await expect(page.getByText("Could not save the folder")).toHaveCount(0);
  });

  test("a folder made for a thread is not left behind when filing the thread fails", async ({
    page,
  }) => {
    const started = await startWithThreads(page);
    runner = started.child;
    await page.route("**/api/folders/threads/*", (route) =>
      route.fulfill({ status: 500, body: "Boom" }),
    );

    await threadLink(page, "Alpha thread").hover();
    await page.getByRole("button", { name: "Options for Alpha thread" }).click();
    await page.getByRole("menuitem", { name: "Move to folder" }).click();
    await page.getByRole("menuitem", { name: "New folder…" }).click();
    const field = page.getByRole("textbox", { name: "Folder name" });
    await field.fill("Orphan");
    await field.press("Enter");

    await expect(page.getByText("Could not create the folder")).toBeVisible();
    await expect(folderOf(page, "Orphan")).toHaveCount(0);
    await expect(async () => {
      const folders = (await (await page.request.get("/api/folders")).json()) as {
        name: string;
      }[];
      expect(folders.map((folder) => folder.name)).not.toContain("Orphan");
    }).toPass({ timeout: 5000 });
  });

  test("dragging a thread to a folder does not split, and dragging to the page still does", async ({
    page,
  }) => {
    const started = await startWithThreads(page);
    runner = started.child;
    await createFolder(page, "Side");
    await page.goto(`/threads/${started.threadId}`);
    await threadLink(page, "Alpha thread").dragTo(folderOf(page, "Side"));
    await expect(folderOf(page, "Side").getByRole("link", { name: "Alpha thread" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/threads/${started.threadId}$`));

    const zone = page.locator('[data-slot="split-drop-zone"]');
    const box = (await zone.boundingBox())!;
    await threadLink(page, "Alpha thread").dragTo(zone, {
      targetPosition: { x: box.width - 80, y: 300 },
    });
    await expect(page).toHaveURL(/split=/);
  });
});
