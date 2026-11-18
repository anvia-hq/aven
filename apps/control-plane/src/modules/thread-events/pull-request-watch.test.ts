import { describe, expect, test } from "bun:test";

import { createPullRequestWatch } from "./pull-request-watch";
import { createWaitingEvents } from "./waiting";
import type { OfferResult, PullWatchSource, ThreadEvent, WatchedPull } from "./types";
import type { GithubPullDetail } from "@aven/github/types";
import type { BotThreadDetail } from "@aven/protocol/types";

const watched = (number: number): WatchedPull => ({
  threadId: "t-1",
  userId: "u1",
  threadTitle: "Login",
  repository: "acme/web",
  installationId: "i1",
  number,
  url: `https://github.com/acme/web/pull/${number}`,
  branch: "aven/t-1",
  title: "Add login",
});

const detail = (changes: Partial<GithubPullDetail>): GithubPullDetail =>
  ({
    title: "Add login",
    status: "open",
    checks: { state: "none", runs: [] },
    ...changes,
  }) as GithubPullDetail;

function setup(
  details: Record<number, GithubPullDetail | null | Error>,
  result: OfferResult = "sent",
) {
  const offered: ThreadEvent[] = [];
  const saved: string[] = [];
  const source: PullWatchSource = {
    openPulls: async () => Object.keys(details).map((number) => watched(Number(number))),
    inspect: async (pull) => {
      const found = details[pull.number];

      if (found instanceof Error) throw found;

      return found ?? null;
    },
    saveEnded: async (pull, state) => void saved.push(`${pull.number} ${state}`),
  };
  const watch = createPullRequestWatch({
    source,
    notes: { offer: async (_userId, event) => (offered.push(event), result) },
  });
  return { watch, offered, saved };
}

describe("the pull request watch", () => {
  test("tells about a merge and remembers it, tells about failing checks by name", async () => {
    const { watch, offered, saved } = setup({
      1: detail({ status: "merged" }),
      2: detail({
        checks: {
          state: "failure",
          runs: [
            { name: "lint", state: "success", url: null },
            { name: "unit", state: "failure", url: null },
          ],
        },
      }),
      3: detail({ checks: { state: "pending", runs: [] } }),
    });
    await watch.tick();
    expect(offered.map((event) => event.kind)).toEqual(["merged", "ci_failing"]);
    expect(offered[1]).toMatchObject({ failing: ["unit"], pull: { number: 2 } });
    expect(saved).toEqual(["1 merged"]);
  });

  test("a merge that was held back by the rate limit is found again on the next tick", async () => {
    const { watch, saved } = setup({ 1: detail({ status: "merged" }) }, "limited");
    await watch.tick();
    expect(saved).toEqual([]);
  });

  test("a merge whose note failed to send is found again on the next tick", async () => {
    const { watch, saved } = setup({ 1: detail({ status: "merged" }) }, "failed");
    await watch.tick();
    expect(saved).toEqual([]);
  });

  test("a closed pull request is remembered without a note, and one that fails to load does not stop the rest", async () => {
    const { watch, offered, saved } = setup({
      1: new Error("GitHub is down"),
      2: detail({ status: "closed" }),
      3: null,
      4: detail({ status: "merged" }),
    });
    await watch.tick();
    expect(saved).toEqual(["2 closed", "4 merged"]);
    expect(offered.map((event) => event.kind)).toEqual(["merged"]);
  });
});

describe("waiting events", () => {
  const look = (changes: Partial<BotThreadDetail>) =>
    (async () => ({
      id: "t-1",
      title: "Login",
      repository: "acme/web",
      mine: true,
      awaitingAnswer: true,
      question: "Which database?",
      ...changes,
    })) as () => Promise<BotThreadDetail>;

  async function run(row: { createdBy: string; state: string } | null, changes = {}) {
    const offered: ThreadEvent[] = [];
    await createWaitingEvents({
      thread: async () => row,
      look: look(changes),
      notes: { offer: async (_userId, event) => (offered.push(event), "sent") },
    }).waiting("t-1", 7);
    return offered;
  }

  test("tells the owner that a thread waits, with its question and the run it ended", async () => {
    expect(await run({ createdBy: "u1", state: "open" })).toEqual([
      {
        kind: "waiting",
        thread: { id: "t-1", title: "Login", repository: "acme/web" },
        run: 7,
        question: "Which database?",
      },
    ]);
  });

  test("says nothing for an archived thread, a thread that is not waiting any more or one that is gone", async () => {
    expect(await run({ createdBy: "u1", state: "archived" })).toEqual([]);
    expect(await run({ createdBy: "u1", state: "open" }, { awaitingAnswer: false })).toEqual([]);
    expect(await run(null)).toEqual([]);
  });
});
