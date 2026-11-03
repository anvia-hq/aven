import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("Memory", () => {
  test("a note is added, edited, shown in the history and deleted", async ({ page }) => {
    await registerUser(page, "memory", "Memory Person");
    await page.goto("/settings/memory");
    await expect(page.getByText("No notes yet.")).toBeVisible();

    await page.getByRole("button", { name: "Add note" }).click();
    await page.getByLabel("Name", { exact: true }).fill("prefers-tea.md");
    await page
      .getByRole("textbox", { name: "Note" })
      .fill("---\ndescription: Drinks tea, not coffee\ntype: user\n---\nOffer tea.");
    await page.getByRole("button", { name: "Add note", exact: true }).click();
    await expect(page.getByText("Note saved")).toBeVisible();

    const notes = page.getByRole("list", { name: "Notes: You" });
    await expect(notes.getByRole("listitem")).toContainText("prefers-tea.md");
    await expect(notes.getByRole("listitem")).toContainText("Drinks tea, not coffee");

    await page.getByRole("button", { name: "Edit prefers-tea.md" }).click();
    await page.getByLabel("Name", { exact: true }).fill("tea.md");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(notes.getByRole("listitem")).toContainText("tea.md");

    await page.getByRole("button", { name: "History" }).click();
    const history = page.getByRole("list", { name: "Memory history" });
    await expect(history).toContainText("You renamed prefers-tea.md to tea.md");
    await expect(history).toContainText("You saved prefers-tea.md");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Delete tea.md" }).click();
    await expect(page.getByText("Note deleted")).toBeVisible();
    await expect(page.getByText("No notes yet.")).toBeVisible();
  });

  test("a name that is not a note's is refused", async ({ page }) => {
    await registerUser(page, "memory", "Memory Person");
    const refused = await page.request.post("/api/memory", {
      data: { scope: "personal", name: "../etc.md", body: "x" },
    });
    expect(refused.status()).toBe(422);
    const project = await page.request.post("/api/memory", {
      data: { scope: "project", projectId: crypto.randomUUID(), name: "x.md", body: "x" },
    });
    expect(project.status()).toBe(404);
  });
});
