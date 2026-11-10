import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CodexLogin } from "./codex-login";
import { CodexThreads } from "./codex-threads";
import type { CodexSupport } from "./types";

const root = mkdtempSync(join(tmpdir(), "codex-login-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const fake = join(import.meta.dir, "testing", "fake-codex-login.ts");

function login(path = fake) {
  const home = mkdtempSync(join(root, "home-"));
  const support: CodexSupport = {
    path,
    threads: new CodexThreads(join(home, "threads.json")),
    env: { PATH: process.env.PATH, HOME: home, CODEX_HOME: home },
    work: join(home, "work"),
  };
  return { login: new CodexLogin(support), home };
}

const until = async (condition: () => Promise<boolean> | boolean) => {
  for (let i = 0; i < 100 && !(await condition()); i++) await Bun.sleep(50);
  expect(await condition()).toBe(true);
};

describe("CodexLogin", () => {
  test("says signed out before anyone has signed in, and signed in after", async () => {
    const { login: flow, home } = login();
    expect(await flow.call("status")).toEqual({ state: "signed-out" });
    writeFileSync(join(home, "signed-in"), "yes");
    expect(await flow.call("status")).toEqual({ state: "signed-in" });
  });

  test("starting a sign-in gives the link and the code, without the colours Codex prints them in", async () => {
    const { login: flow } = login();
    const started = await flow.call("start");
    expect(started).toEqual({
      state: "waiting",
      url: "https://auth.openai.com/codex/device",
      code: "AOL5-C2T9O",
    });
    await flow.call("cancel");
  });

  test("a second start while waiting gives the same code, and starts nothing new", async () => {
    const { login: flow } = login();
    const first = await flow.call("start");
    const second = await flow.call("start");
    expect(second).toEqual(first);
    expect(await flow.call("status")).toEqual(first);
    await flow.call("cancel");
  });

  test("when the person approves, the status becomes signed in", async () => {
    const { login: flow, home } = login();
    await flow.call("start");
    writeFileSync(join(home, "approve"), "");
    await until(async () => (await flow.call("status")).state === "signed-in");
  });

  test("when the sign-in is refused, the status says why, once", async () => {
    const { login: flow, home } = login();
    await flow.call("start");
    writeFileSync(join(home, "deny"), "");
    let failed: Awaited<ReturnType<typeof flow.call>> | undefined;
    for (let i = 0; i < 100 && failed?.state !== "failed"; i++) {
      failed = await flow.call("status");
      await Bun.sleep(50);
    }
    expect(failed).toMatchObject({ state: "failed", error: expect.stringContaining("denied") });
    expect(await flow.call("status")).toEqual({ state: "signed-out" });
  });

  test("cancelling stops the sign-in and leaves the person signed out", async () => {
    const { login: flow, home } = login();
    await flow.call("start");
    expect(await flow.call("cancel")).toEqual({ state: "signed-out" });
    writeFileSync(join(home, "approve"), "");
    await Bun.sleep(300);
    expect(existsSync(join(home, "signed-in"))).toBe(false);
  });

  test("a person who is already signed in is told so, and no new sign-in starts", async () => {
    const { login: flow, home } = login();
    writeFileSync(join(home, "signed-in"), "yes");
    expect(await flow.call("start")).toEqual({ state: "signed-in" });
  });

  test("a Codex that cannot be run is reported as unavailable, with why", async () => {
    const { login: flow } = login("/nonexistent/codex");
    const result = await flow.call("status");
    expect(result.state).toBe("unavailable");
    expect(result.error).toBeTruthy();
  });
});
