import { describe, expect, test } from "bun:test";

import { noteDescription } from "@aven/protocol/memory";

import {
  ACTIVITY_DIGEST_MAX_CHARS,
  ACTIVITY_DIGEST_STALE_MS,
  ActivityDigests,
  activityDigest,
  isStale,
} from "./activity-digest";
import type { ActivityDigestStore } from "./types";
import type { BotThreadView, CockpitTask } from "@aven/protocol/types";

const NOW = new Date("2026-11-10T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

const thread = (over: Partial<BotThreadView> = {}): BotThreadView => ({
  id: crypto.randomUUID(),
  title: "Fix <login> bug\nnow",
  projectId: "p1",
  repository: "acme/web",
  state: "open",
  mine: true,
  running: false,
  awaitingAnswer: false,
  pullRequests: [],
  updatedAt: daysAgo(1),
  ...over,
});

const task = (number: number, over: Partial<CockpitTask> = {}): CockpitTask => ({
  id: String(number),
  number,
  title: `Task ${number}`,
  description: "",
  status: "done",
  priority: "none",
  dueDate: null,
  tags: [],
  position: 0,
  createdAt: daysAgo(30),
  updatedAt: daysAgo(2),
  ...over,
});

describe("activityDigest", () => {
  test("is the same text for the same input and has the frontmatter a note has", () => {
    const input = {
      now: NOW,
      threads: [
        thread({ pullRequests: [{ number: 9, url: "u", title: "Add login", state: "merged" }] }),
      ],
      tasks: [task(3)],
    };
    const text = activityDigest(input);
    expect(activityDigest(input)).toBe(text);
    expect(noteDescription(text)).toBe(
      "What the person worked on in the last 7 days, written by the app as of 2026-11-10",
    );
    expect(text).toContain("- #9 Add login (acme/web)");
    expect(text).toContain("- T-3 [done] Task 3");
    expect(text).toContain(
      '- "Fix login bug now": acme/web, idle, PR #9 merged, last active 1d ago',
    );
  });

  test("leaves out what is older than a week, a shared thread and an empty section", () => {
    const text = activityDigest({
      now: NOW,
      threads: [
        thread({ title: "old", updatedAt: daysAgo(9) }),
        thread({ title: "theirs", mine: false }),
        thread({ title: "running one", running: true }),
        thread({ title: "asking", awaitingAnswer: true, updatedAt: daysAgo(3) }),
      ],
      tasks: [task(1, { updatedAt: daysAgo(8) })],
    });
    expect(text).not.toContain('"old"');
    expect(text).not.toContain("theirs");
    expect(text).not.toContain("## Tasks");
    expect(text).not.toContain("## Pull requests");
    expect(text).toContain("running one");
    expect(text).toContain("waiting for the person's answer");
    expect(text.indexOf("running one")).toBeLessThan(text.indexOf("asking"));
  });

  test("says so when nothing happened", () => {
    expect(activityDigest({ now: NOW, threads: [], tasks: [] })).toContain(
      "Nothing in the last 7 days.",
    );
  });

  test("stays under the cap and counts what it left out", () => {
    const text = activityDigest({
      now: NOW,
      threads: Array.from({ length: 200 }, (_, index) =>
        thread({ title: `Thread ${index} ${"x".repeat(60)}` }),
      ),
      tasks: Array.from({ length: 200 }, (_, index) => task(index)),
    });
    expect(text.length).toBeLessThanOrEqual(ACTIVITY_DIGEST_MAX_CHARS);
    expect(text).toMatch(/… and \d+ more not listed\./);
  });
});

describe("isStale", () => {
  test("is stale when never written or six hours old", () => {
    expect(isStale(undefined, NOW)).toBe(true);
    expect(isStale(new Date(NOW.getTime() - ACTIVITY_DIGEST_STALE_MS), NOW)).toBe(true);
    expect(isStale(new Date(NOW.getTime() - ACTIVITY_DIGEST_STALE_MS + 1), NOW)).toBe(false);
  });
});

describe("ActivityDigests.keep", () => {
  function keeper(writtenAt?: Date) {
    const calls: { name: string; body: string; since: Date }[] = [];
    let reads = 0;
    const store: ActivityDigestStore = {
      writtenAt: async () => writtenAt,
      refresh: async (_place, name, body, since) => (calls.push({ name, body, since }), true),
    };
    const digests = new ActivityDigests(
      store,
      {
        threads: async () => (reads++, [thread()]),
        tasks: async () => [],
      },
      () => NOW,
    );
    return { digests, calls, reads: () => reads };
  }

  test("writes the note when there is none, telling the store how old counts as fresh", async () => {
    const { digests, calls } = keeper();
    await digests.keep("u1", "b1");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ name: "activity-digest.md" });
    expect(calls[0]!.body).toContain("Fix login bug now");
    expect(calls[0]!.since.getTime()).toBe(NOW.getTime() - ACTIVITY_DIGEST_STALE_MS);
  });

  test("does not even read the person's data while the note is fresh", async () => {
    const { digests, calls, reads } = keeper(new Date(NOW.getTime() - 60_000));
    await digests.keep("u1", "b1");
    expect(calls).toHaveLength(0);
    expect(reads()).toBe(0);
  });
});
