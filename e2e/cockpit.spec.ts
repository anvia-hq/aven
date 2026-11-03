import { expect, test } from "@playwright/test";

import { registerUser } from "./helpers";

test.describe("Cockpit", () => {
  test("the rail opens the cockpit, and the inbox captures, ticks off and deletes", async ({
    page,
  }) => {
    await registerUser(page, "cockpit", "Cockpit Person");
    await page.goto("/threads");
    await page.getByRole("link", { name: "Cockpit" }).click();
    await expect(page).toHaveURL(/\/cockpit\/inbox/);
    await expect(page.getByText("Nothing in your inbox.")).toBeVisible();

    await page.getByLabel("Capture", { exact: true }).fill("Call the bank");
    await page.getByLabel("Tags for the capture").fill("Errand");
    await page.getByLabel("Tags for the capture").press("Enter");
    await page.getByRole("button", { name: "Capture" }).click();
    const open = page.getByRole("list", { name: "Open items" });
    await expect(open).toContainText("Call the bank");
    await expect(open).toContainText("#errand");
    await expect(page.getByRole("navigation", { name: "Cockpit" })).toContainText("errand");

    await page.getByRole("checkbox", { name: "Mark Call the bank done" }).click();
    await expect(page.getByText("Nothing in your inbox.")).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(page.getByRole("list", { name: "Done items" })).toContainText("Call the bank");
    await page.getByRole("button", { name: "Delete Call the bank" }).click();
    await expect(page.getByText("Nothing done yet.")).toBeVisible();
  });

  test("tasks are made, dragged across the board, changed in the list, and filtered by tag", async ({
    page,
  }) => {
    await registerUser(page, "cockpit", "Cockpit Person");
    await page.goto("/cockpit/tasks");

    const make = async (title: string, tag?: string) => {
      await page.getByRole("button", { name: "New task", exact: true }).click();
      await page.getByLabel("Title").fill(title);
      if (tag) {
        await page.getByLabel("Tags").fill(tag);
        await page.getByLabel("Tags").press("Enter");
      }
      await page.getByRole("button", { name: "Create task" }).click();
      // The toast is a dialog too: the form is gone when its title field is.
      await expect(page.getByLabel("Title")).toHaveCount(0);
    };
    await make("Write the plan", "work");
    await make("Buy milk");

    const todo = page.getByRole("region", { name: "Todo" });
    const doing = page.getByRole("region", { name: "In progress" });
    await expect(todo.getByRole("listitem", { name: "T-1 Write the plan" })).toBeVisible();
    await expect(todo.getByRole("listitem", { name: "T-2 Buy milk" })).toBeVisible();

    await todo.getByRole("listitem", { name: "T-1 Write the plan" }).dragTo(doing);
    await expect(doing.getByRole("listitem", { name: "T-1 Write the plan" })).toBeVisible();
    // Saved: still there after a reload.
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "In progress" })
        .getByRole("listitem", { name: "T-1 Write the plan" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page).toHaveURL(/view=list/);
    const table = page.getByRole("table", { name: "Tasks" });
    await expect(table).toContainText("Write the plan");
    await page.getByRole("combobox", { name: "Status of T-2" }).click();
    await page.getByRole("option", { name: "Done" }).click();
    await expect(page.getByRole("combobox", { name: "Status of T-2" })).toContainText("Done");

    await page
      .getByRole("navigation", { name: "Cockpit" })
      .getByRole("link", { name: "work" })
      .click();
    await expect(page).toHaveURL(/tag=work/);
    await expect(table).toContainText("Write the plan");
    await expect(table).not.toContainText("Buy milk");

    await table.getByRole("button", { name: "Write the plan" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No tasks yet.")).toBeVisible();
  });

  test("notes are written, pinned and previewed", async ({ page }) => {
    await registerUser(page, "cockpit", "Cockpit Person");
    await page.goto("/cockpit/notes");
    await page.getByRole("button", { name: "New note" }).click();
    await page.getByLabel("Title").fill("Release checklist");
    await page.getByRole("textbox", { name: "Note" }).fill("# Steps\n\n- Tag it\n- Check the run");
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.getByRole("heading", { name: "Steps" })).toBeVisible();
    await page.getByRole("switch", { name: "Pin to the top" }).click();
    await page.getByRole("button", { name: "Create note" }).click();

    const notes = page.getByRole("list", { name: "Notes" });
    await expect(notes).toContainText("Release checklist");
    await expect(notes.getByRole("img", { name: "Pinned" })).toBeVisible();
    await notes.getByRole("button", { name: /Release checklist/ }).click();
    await page.getByLabel("Title").fill("Release steps");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(notes).toContainText("Release steps");
  });
});
