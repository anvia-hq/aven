import { expect, test, type Page } from "@playwright/test";

import { registerUser } from "./helpers";

// The server has answered a save whose body holds `text`: what a reload then shows is what it kept.
const savedWith = (page: Page, text: string) =>
  page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      Boolean(response.request().postData()?.includes(text)) &&
      response.ok(),
  );

test.describe("Cockpit", () => {
  test("the rail opens the cockpit, and the inbox reads like mail: captured, opened, written in, done and deleted", async ({
    page,
  }) => {
    await registerUser(page, "cockpit", "Cockpit Person");
    await page.goto("/threads");
    await page.getByRole("link", { name: "Cockpit" }).click();
    await expect(page).toHaveURL(/\/cockpit\/inbox/);
    await expect(page.getByText("Nothing in your inbox.")).toBeVisible();

    // A new item cancelled is gone, nothing of it sent.
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/cockpit/inbox")) {
        posts.push(request.url());
      }
    });
    await page.getByRole("button", { name: "New item" }).click();
    const draft = page.getByRole("article", { name: "New item" });
    await expect(draft.getByRole("textbox", { name: "Title" })).toBeFocused();
    await page.keyboard.type("Never mind");
    await draft.getByRole("button", { name: "Cancel" }).click();
    await expect(draft).toHaveCount(0);
    await expect(page.getByText("Nothing in your inbox.")).toBeVisible();
    expect(posts).toEqual([]);

    // A new item added: kept, with its tags, and opened beside the list.
    await page.getByRole("button", { name: "New item" }).click();
    await expect(draft.getByRole("button", { name: "Add to inbox" })).toBeDisabled();
    await page.keyboard.type("Call the bank");
    await draft.getByLabel("Tags").fill("errand");
    await draft.getByLabel("Tags").press("Enter");
    await draft.getByRole("button", { name: "Add to inbox" }).click();
    const reader = page.getByRole("article", { name: "Call the bank" });
    await expect(reader).toBeVisible();
    await expect(page).toHaveURL(/item=(?!new)/);
    expect(posts).toHaveLength(1);
    const editor = reader.locator(".bn-editor");
    const saved = savedWith(page, "card fee");
    await editor.click();
    await page.keyboard.type("Ask about the card fee.");
    await expect(page.getByRole("list", { name: "Open items" })).toContainText(
      "Ask about the card fee.",
    );

    // Saved: there after a reload.
    await saved;
    await page.reload();
    await expect(reader.locator(".bn-editor")).toContainText("Ask about the card fee.");
    await expect(page.getByRole("list", { name: "Open items" })).toContainText("errand");

    // Written in and done at once, every save held back: the details' reply, which lands first,
    // does not undo Done while Done's own is on its way, and both are kept.
    await page.route("**/api/cockpit/inbox/*", async (route) => {
      if (route.request().method() === "PATCH") await new Promise((done) => setTimeout(done, 800));
      await route.continue();
    });
    await reader.locator(".bn-editor").click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Before Friday.");
    const details = savedWith(page, "Before Friday");
    await reader.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("Nothing in your inbox.")).toBeVisible();
    await details;
    await page.waitForTimeout(200);
    expect(await reader.getByRole("button", { name: "Move to inbox" }).isVisible()).toBe(true);
    await savedWith(page, "done");
    await page.unroute("**/api/cockpit/inbox/*");
    await page.reload();
    await page.getByRole("tab", { name: "Done" }).click();
    await expect(page.getByRole("list", { name: "Done items" })).toContainText("Call the bank");
    await expect(reader.locator(".bn-editor")).toContainText("Before Friday.");

    // Deleted while a save waits: the save is dropped, not sent to a record that is gone.
    const failed: string[] = [];
    page.on("response", (response) => {
      if (!response.ok()) failed.push(`${response.request().method()} ${response.status()}`);
    });
    await reader.locator(".bn-editor").click();
    await page.keyboard.type(" Gone.");
    await reader.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByText("Nothing done yet.")).toBeVisible();
    await page.waitForTimeout(1000);
    expect(failed).toEqual([]);
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
        await page.getByRole("dialog").getByRole("textbox", { name: "Tags" }).fill(tag);
        await page.getByRole("dialog").getByRole("textbox", { name: "Tags" }).press("Enter");
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

    await page.getByRole("tab", { name: "List" }).click();
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

  test("a card is reordered in its column and stays so, and one dropped on itself does not move", async ({
    page,
  }) => {
    await registerUser(page, "cockpit", "Cockpit Person");
    for (const title of ["First", "Second", "Third"]) {
      await page.request.post("/api/cockpit/tasks", { data: { title } });
    }
    await page.goto("/cockpit/tasks");
    const todo = page.getByRole("region", { name: "Todo" });
    const order = () => todo.getByRole("listitem").filter({ hasText: "T-" }).allInnerTexts();
    // A new task goes to the top: Third, Second, First.
    await expect
      .poll(async () => (await order()).map((text) => text.split("\n")[1]))
      .toEqual(["Third", "Second", "First"]);
    const card = (name: string) => todo.getByRole("listitem", { name });

    // Dropped on its own lower half: nothing is saved.
    const saves: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH") saves.push(request.url());
    });
    await card("T-2 Second").dragTo(card("T-2 Second"), { targetPosition: { x: 20, y: 40 } });
    await page.waitForTimeout(300);
    expect(saves).toEqual([]);

    // First, dragged onto the top half of Third, goes first.
    await card("T-1 First").dragTo(card("T-3 Third"), { targetPosition: { x: 20, y: 5 } });
    await expect.poll(() => saves.length).toBe(1);
    await page.reload();
    await expect
      .poll(async () => (await order()).map((text) => text.split("\n")[1]))
      .toEqual(["First", "Third", "Second"]);
  });

  test("a note is started, written in BlockNote, pinned, found and kept", async ({ page }) => {
    await registerUser(page, "cockpit", "Cockpit Person");
    await page.goto("/cockpit/notes");
    await page.getByRole("button", { name: "New note" }).click();
    // Its title is ready to be typed over.
    const title = page.getByRole("textbox", { name: "Title" });
    await expect(title).toBeFocused();
    await page.keyboard.type("Release checklist");
    // Enter goes on from the title to the document, as in Notion, once the editor has loaded.
    const note = page.getByRole("article", { name: /Release checklist|Untitled/ });
    await expect(note.locator(".bn-editor")).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(note.locator(".bn-editor")).toBeFocused();
    const saved = savedWith(page, "Tag it");
    await page.keyboard.type("# Steps");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Tag it");
    await expect(note.locator(".bn-editor h1")).toHaveText("Steps");
    await note.getByRole("button", { name: "Pin" }).click();
    // Pinned, it is in the sidebar.
    await expect(page.getByRole("list", { name: "Pinned notes" })).toContainText(
      "Release checklist",
    );

    await saved;
    await page.reload();
    await expect(
      page.getByRole("article", { name: "Release checklist" }).locator(".bn-editor h1"),
    ).toHaveText("Steps");

    // Back to the notes, a page that lists them.
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("button", { name: "Notes" })
      .click();
    await expect(page.getByRole("heading", { name: "Notes", level: 1 })).toBeVisible();
    const notes = page.getByRole("list", { name: "Notes", exact: true });
    await expect(notes).toContainText("Release checklist");
    await expect(notes).toContainText("Steps Tag it");
    await expect(notes.getByRole("img", { name: "Pinned" })).toBeVisible();
    await page.getByLabel("Search notes").fill("nothing like it");
    await expect(page.getByText("No note matches.")).toBeVisible();
    await page.getByLabel("Search notes").fill("tag it");
    await expect(notes).toContainText("Release checklist");
    await notes.getByRole("button", { name: /Release checklist/ }).click();
    await expect(page.getByRole("article", { name: "Release checklist" })).toBeVisible();
  });

  test("a tag is added on the tags page, given a color, and shown in it everywhere", async ({
    page,
  }) => {
    await registerUser(page, "cockpit", "Cockpit Person");
    await page.goto("/cockpit/inbox");
    await page
      .getByRole("navigation", { name: "Cockpit" })
      .getByRole("link", { name: "Tags", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Tags", level: 1 })).toBeVisible();

    await page.getByLabel("New tag").fill("Big Idea");
    await page.getByRole("button", { name: "Add tag" }).click();
    const row = page.getByRole("list", { name: "All tags" }).getByRole("listitem", {
      name: "big-idea",
    });
    await expect(row).toContainText("Not used yet");

    await row.getByRole("button", { name: "Color of big-idea" }).click();
    await page.getByRole("button", { name: "Green", exact: true }).click();
    await page.reload();
    await row.getByRole("button", { name: "Color of big-idea" }).click();
    await expect(page.getByRole("button", { name: "Green", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("Escape");

    // A note given the tag draws it in that color.
    await page.goto("/cockpit/notes");
    await page.getByRole("button", { name: "New note" }).click();
    const tags = page.getByRole("article").getByRole("textbox", { name: "Tags" });
    await tags.fill("big-idea");
    await tags.press("Enter");
    const chip = page.getByRole("article").getByText("big-idea", { exact: true });
    await expect(chip).toHaveCSS("background-color", "rgb(0, 168, 79)");
  });
});
