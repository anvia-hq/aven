import { describe, expect, test } from "bun:test";

import { createPullRequestSync } from "./pull-request";
import type { ThreadPullRequest } from "./service";

const thread = { id: "abcdef12-0000-4000-8000-000000000000", organizationId: "org-1" };
const project = { githubInstallationId: "inst-1", repoFullName: "acme/app" };

const pull = (number: number, extra: Partial<ThreadPullRequest> = {}): ThreadPullRequest => ({
  number,
  url: `https://github.com/acme/app/pull/${number}`,
  branch: "aven/abcdef12",
  title: `Pull ${number}`,
  state: "open",
  ...extra,
});

function setup(options: { found?: ThreadPullRequest[]; known?: boolean } = {}) {
  const { found = [], known = true } = options;
  const asked: unknown[][] = [];
  const saved: unknown[] = [];
  const sync = createPullRequestSync({
    thread: async () => (known ? { projectId: "p1" } : null),
    project: async () => project,
    find: async (...args) => {
      asked.push(args);
      return found;
    },
    save: async (id, pullRequests) => {
      saved.push({ id, pullRequests });
    },
  });
  return { sync, asked, saved };
}

describe("learning of the pull requests the agent opened", () => {
  test("asks GitHub for the pull requests of the thread's branches and keeps them all", async () => {
    const found = [pull(8, { branch: "aven/abcdef12-docs" }), pull(7)];
    const { sync, asked, saved } = setup({ found });

    expect(await sync(thread)).toEqual(found);

    expect(asked).toEqual([["inst-1", "acme/app", "aven/abcdef12"]]);
    expect(saved).toEqual([{ id: thread.id, pullRequests: found }]);
  });

  test("asks again after every run, since a thread ships again and a pull request gets merged", async () => {
    const { sync, asked } = setup({ found: [pull(7)] });

    await sync(thread);
    await sync(thread);

    expect(asked).toHaveLength(2);
  });

  test("finds nothing when there is none yet, or the thread is gone", async () => {
    const none = setup({ found: [] });
    expect(await none.sync(thread)).toEqual([]);

    const gone = setup({ known: false });
    expect(await gone.sync(thread)).toEqual([]);
    expect(gone.asked).toEqual([]);
    expect(gone.saved).toEqual([]);
  });
});
