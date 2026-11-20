import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { journalPath } from "@aven/agent-backend/testing/journal-path";
import type { HostedRunContext } from "@aven/agent-backend/types";
import { describe, expect, test } from "bun:test";

import { CodexRuns } from "./backend";
import { writeCodexAuth } from "./sdk";
import type { CodexQuery } from "./types";

const context = (extra: Partial<HostedRunContext> = {}): HostedRunContext => ({
  token: "sk-codex-backend-test-0001",
  workspace: async () => "/work",
  redact: (text) => text,
  env: [],
  tools: {},
  ...extra,
});

describe("CodexRuns lifecycle fixes", () => {
  test("cancelling a parked question clears the stored question so asked returns undefined", async () => {
    const parked = Promise.withResolvers<void>();
    const query: CodexQuery = (input) => {
      const stream = (async function* () {
        yield { type: "thread.started" as const, thread_id: "sess-codex-cancel" };
        const waiting = input.tools.onPark?.({
          name: "ask_user",
          questions: [{ id: "color", text: "Which color?" }],
        });
        parked.resolve();
        await waiting?.catch(() => undefined);
      })();
      return stream;
    };
    const runs = CodexRuns.open(journalPath(), query);
    const followed = await runs.start(
      "run-park-cancel",
      "thread-park-cancel",
      "ask me",
      { codex: context() },
      () => undefined,
    );
    await parked.promise;
    const interaction = await followed.done;
    expect(interaction.type).toBe("interaction");
    expect(await runs.asked("thread-park-cancel")).toBeDefined();

    await followed.cancel();
    expect(await runs.asked("thread-park-cancel")).toBeUndefined();
    await runs.close();
  });

  test("persists sessionId immediately on thread.started even when it is the only event", async () => {
    const seenSessionIds: (string | undefined)[] = [];
    const query: CodexQuery = (input) => {
      seenSessionIds.push(input.sessionId);
      const stream = (async function* () {
        yield { type: "thread.started" as const, thread_id: "sess-only-event" };
      })();
      return stream;
    };
    const runs = CodexRuns.open(journalPath(), query);
    const first = await runs.start(
      "r1",
      "thread-late",
      "hi",
      { codex: context() },
      () => undefined,
    );
    await first.done;
    const second = await runs.start(
      "r2",
      "thread-late",
      "again",
      { codex: context() },
      () => undefined,
    );
    await second.done;
    await runs.close();
    expect(seenSessionIds).toEqual([undefined, "sess-only-event"]);
  });

  test("reports refreshed auth.json before removing it in finally", async () => {
    const initial = JSON.stringify({
      tokens: { access_token: "acc-1", refresh_token: "ref-1" },
    });
    const refreshed = JSON.stringify({
      tokens: { access_token: "acc-2", refresh_token: "ref-2" },
    });
    const renewals: { token: string; previous: string }[] = [];
    let observedHome = "";
    const query: CodexQuery = (input) => {
      observedHome = input.codexHome;
      const stream = (async function* () {
        mkdirSync(input.codexHome, { recursive: true });
        writeCodexAuth(input.codexHome, refreshed);
        yield { type: "thread.started" as const, thread_id: "sess-auth" };
      })();
      return stream;
    };
    const runs = CodexRuns.open(journalPath(), query);
    const followed = await runs.start(
      "r-auth",
      "thread-auth",
      "hi",
      {
        codex: context({
          token: initial,
          renewed: (token, previous) => renewals.push({ token, previous }),
        }),
      },
      () => undefined,
    );
    await followed.done;
    await runs.close();
    expect(renewals).toEqual([{ token: refreshed, previous: initial }]);
    expect(observedHome.length).toBeGreaterThan(0);
    expect(existsSync(join(observedHome, "auth.json"))).toBe(false);
  });
});
