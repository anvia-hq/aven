import { describe, expect, test } from "bun:test";

import { createBranchPullRequests } from "./branch-pull-requests";
import type { ThreadPullRequest } from "../threads/types";

const pull: ThreadPullRequest = {
  number: 658,
  url: "https://github.com/acme/app/pull/658",
  branch: "feat/vector",
  title: "Record vector context",
  state: "open",
};

function setup(overrides: Partial<Parameters<typeof createBranchPullRequests>[0]> = {}) {
  const saved: ThreadPullRequest[][] = [];
  const asked: string[] = [];
  const lookup = createBranchPullRequests({
    branch: async () => "feat/vector",
    project: async () => ({ githubInstallationId: "i-1", repoFullName: "acme/app" }),
    find: async (_installation, _repo, branch) => {
      asked.push(branch);
      return [pull];
    },
    save: async (_thread, pullRequests) => void saved.push(pullRequests),
    ...overrides,
  });
  return { lookup, saved, asked };
}

describe("the pull requests of the branch a thread is on", () => {
  test("are asked of GitHub by the runner's branch, and kept on the thread", async () => {
    const { lookup, saved, asked } = setup();
    expect(await lookup("org", "thread")).toEqual({ branch: "feat/vector", pullRequests: [pull] });
    expect(asked).toEqual(["feat/vector"]);
    expect(saved).toEqual([[pull]]);
  });

  test("a branch GitHub has no pull request for is a known branch with none", async () => {
    const { lookup } = setup({ find: async () => [] });
    expect(await lookup("org", "thread")).toEqual({ branch: "feat/vector", pullRequests: [] });
  });

  test("a branch nobody can name, or an installation that cannot read, is not known", async () => {
    expect(await setup({ branch: async () => null }).lookup("org", "thread")).toEqual({
      branch: null,
      pullRequests: [],
    });
    expect(await setup({ find: async () => null }).lookup("org", "thread")).toEqual({
      branch: null,
      pullRequests: [],
    });
    expect(await setup({ project: async () => null }).lookup("org", "thread")).toEqual({
      branch: null,
      pullRequests: [],
    });
  });

  test("an unreachable GitHub is an error, never an answer", async () => {
    const { lookup, saved } = setup({
      find: async () => {
        throw new Error("GitHub is down");
      },
    });
    await expect(lookup("org", "thread")).rejects.toThrow("GitHub is down");
    expect(saved).toEqual([]);
  });
});
