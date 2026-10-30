import { describe, expect, test } from "bun:test";

import { createPullRequestSync } from "./pull-request";

const thread = { id: "abcdef12-0000-4000-8000-000000000000", organizationId: "org-1" };
const project = { githubInstallationId: "inst-1", repoFullName: "acme/app" };

// Services that hold one thread, and record what the sync asked and saved.
function setup(
  options: {
    pullRequestNumber?: number | null;
    found?: { number: number; url: string } | null;
    known?: boolean;
  } = {},
) {
  const { pullRequestNumber = null, found = null, known = true } = options;
  const asked: unknown[][] = [];
  const saved: unknown[] = [];
  const sync = createPullRequestSync({
    thread: async () => (known ? { projectId: "p1", pullRequestNumber } : null),
    project: async () => project,
    find: async (...args) => {
      asked.push(args);
      return found;
    },
    save: async (id, pullRequest) => {
      saved.push({ id, pullRequest });
    },
  });
  return { sync, asked, saved };
}

describe("learning of the pull request the agent opened", () => {
  test("asks GitHub for the pull request of the thread's branch and keeps it", async () => {
    const { sync, asked, saved } = setup({
      found: { number: 7, url: "https://github.com/acme/app/pull/7" },
    });

    expect(await sync(thread)).toEqual({ number: 7, url: "https://github.com/acme/app/pull/7" });

    expect(asked).toEqual([["inst-1", "acme/app", "aven/abcdef12"]]);
    expect(saved).toEqual([
      { id: thread.id, pullRequest: { number: 7, url: "https://github.com/acme/app/pull/7" } },
    ]);
  });

  test("stops asking for a thread that has one", async () => {
    const { sync, asked } = setup({ pullRequestNumber: 3, found: { number: 9, url: "x" } });

    expect(await sync(thread)).toBeNull();
    expect(asked).toEqual([]);
  });

  test("keeps nothing when there is none yet, or the thread is gone", async () => {
    const none = setup({ found: null });
    expect(await none.sync(thread)).toBeNull();
    expect(none.saved).toEqual([]);

    const gone = setup({ known: false });
    expect(await gone.sync(thread)).toBeNull();
    expect(gone.asked).toEqual([]);
  });
});
