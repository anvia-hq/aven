import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createServer as createSocketServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { registerUser, threadOnFakeRunner } from "./helpers";

const VITE = resolve("apps/platform/node_modules/vite/bin/vite.js");

function freePort() {
  return new Promise<number>((done, fail) => {
    const probe = createSocketServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
}

async function waitFor(url: string) {
  await expect(async () => {
    const response = await fetch(url);
    expect(response.status).toBeLessThan(500);
  }).toPass({ timeout: 20_000 });
}

test.describe("a real dev server in the Browser", () => {
  let runner: ChildProcess | undefined;
  let vite: ChildProcess | undefined;
  let api: Server | undefined;
  test.afterEach(() => {
    runner?.kill();
    vite?.kill();
    api?.close();
    runner = vite = api = undefined;
  });

  test("a Vite app with an API behind its proxy signs in and hot reloads, and a call to localhost is the person's own machine", async ({
    page,
  }: {
    page: Page;
  }) => {
    const apiPort = await freePort();
    const vitePort = await freePort();
    const nothingPort = await freePort();
    const seen: { path: string; origin: string; cookie: string }[] = [];
    api = createServer((request, response) => {
      seen.push({
        path: request.url ?? "",
        origin: String(request.headers.origin ?? ""),
        cookie: String(request.headers.cookie ?? ""),
      });
      const headers: Record<string, string | string[]> = { "Content-Type": "application/json" };
      if (request.url === "/api/ping") {
        headers["Set-Cookie"] = "sid=abc123; Path=/; HttpOnly; SameSite=Lax; Domain=localhost";
      }
      response.writeHead(200, headers);
      response.end(JSON.stringify({ cookie: request.headers.cookie ?? "" }));
    });
    await new Promise<void>((done) => api!.listen(apiPort, "127.0.0.1", done));

    const root = mkdtempSync(join(tmpdir(), "aven-real-app-"));
    const page$ = (label: string) => `<!doctype html>
<title>real app</title>
<h1>Real app</h1>
<p id="label">${label}</p>
<p id="ping">loading</p>
<p id="me">loading</p>
<p id="absolute">loading</p>
<script type="module" src="/main.js"></script>`;
    writeFileSync(join(root, "index.html"), page$("first"));
    writeFileSync(
      join(root, "main.js"),
      `const show = (id, value) => { document.getElementById(id).textContent = value; };
const ping = await fetch("/api/ping", { credentials: "include" });
show("ping", "ping " + ping.status);
await fetch("/api/login", { method: "POST", credentials: "include" });
const me = await (await fetch("/api/me", { credentials: "include" })).json();
show("me", "cookie " + me.cookie);
try {
  await fetch("http://localhost:${nothingPort}/api/ping", { mode: "no-cors" });
  show("absolute", "absolute reached");
} catch {
  show("absolute", "absolute failed");
}
`,
    );
    writeFileSync(
      join(root, "vite.config.js"),
      `export default { server: { proxy: { "/api": "http://127.0.0.1:${apiPort}" } } };`,
    );
    vite = spawn(
      "bun",
      [VITE, root, "--host", "127.0.0.1", "--port", String(vitePort), "--strictPort"],
      { stdio: "ignore" },
    );
    await waitFor(`http://127.0.0.1:${vitePort}/`);

    await registerUser(page, "real", "Real App User");
    const started = await threadOnFakeRunner(page, { FAKE_REAL_PORT: String(vitePort) });
    runner = started.child;
    const consoles: string[] = [];
    page.on("console", (message) => consoles.push(message.text()));
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto(`/threads/${started.threadId}`);
    await page.getByRole("button", { name: "Browser", exact: true }).click();
    const panel = page.getByRole("region", { name: "Browser" });
    await panel.getByRole("textbox", { name: "Port" }).fill(String(vitePort));
    await panel.getByRole("button", { name: "Open", exact: true }).click();
    const frame = panel.frameLocator('iframe[title="Browser"]');

    await expect(frame.getByRole("heading", { name: "Real app" })).toBeVisible({ timeout: 20_000 });
    await expect(frame.locator("#ping")).toHaveText("ping 200");
    await expect(frame.locator("#me")).toHaveText("cookie sid=abc123");
    await expect(frame.locator("#absolute")).toHaveText("absolute failed");
    const me = seen.find((entry) => entry.path === "/api/me");
    expect(me?.cookie).toBe("sid=abc123");
    expect(me?.cookie).not.toContain("aven");
    expect(seen.find((entry) => entry.path === "/api/login")?.origin).toBe(
      `http://localhost:${vitePort}`,
    );
    await expect.poll(() => consoles.some((line) => line.includes("[vite] connected."))).toBe(true);

    writeFileSync(join(root, "index.html"), page$("second, after a hot reload"));
    await expect(frame.locator("#label")).toHaveText("second, after a hot reload", {
      timeout: 15_000,
    });
  });
});
