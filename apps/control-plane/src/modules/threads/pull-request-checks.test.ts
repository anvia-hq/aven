import { describe, expect, test } from "bun:test";

import type { GithubPullDetail } from "@aven/github/types";

import { threadPullRequestChecks } from "./pull-request-checks";
import type { ThreadPullRequest } from "./types";

const pull = (number: number): ThreadPullRequest => ({
  number,
  url: `https://github.com/acme/web/pull/${number}`,
  branch: `feat/${number}`,
  title: `PR #${number}`,
  state: "open",
});

function detail(overrides: Partial<GithubPullDetail> = {}): GithubPullDetail {
  return {
    number: 1,
    url: "https://github.com/acme/web/pull/1",
    title: "Fix export",
    body: "",
    status: "open",
    author: "ada",
    base: "main",
    head: "feat/1",
    mergeable: true,
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    commits: 1,
    comments: 0,
    createdAt: "",
    updatedAt: "",
    files: [],
    filesTruncated: false,
    reviews: [],
    requestedReviewers: [],
    checks: { state: "success", runs: [] },
    ...overrides,
  };
}

describe("threadPullRequestChecks", () => {
  test("returns empty immediately when a thread has no pulls or project has no GitHub repo", async () => {
    expect(
      await threadPullRequestChecks(
        "org-1",
        { projectId: "p-1", pullRequests: [] },
        {
          getProject: async () => {
            throw new Error("should not be called");
          },
          getPull: async () => null,
        },
      ),
    ).toEqual([]);

    expect(
      await threadPullRequestChecks(
        "org-1",
        { projectId: "p-1", pullRequests: [pull(1)] },
        {
          getProject: async () => ({ githubInstallationId: null, repoFullName: null }),
          getPull: async () => null,
        },
      ),
    ).toEqual([]);
  });

  test("maps check states, caps failing check names at 5, and omits timed-out pulls", async () => {
    const result = await threadPullRequestChecks(
      "org-1",
      { projectId: "p-1", pullRequests: [pull(1), pull(2)] },
      {
        timeoutMs: 25,
        getProject: async () => ({ githubInstallationId: "inst-99", repoFullName: "acme/web" }),
        getPull: async (_installationId, _repo, number) => {
          if (number === 2) {
            await Bun.sleep(100);
            return detail({ number: 2 });
          }

          return detail({
            number: 1,
            checks: {
              state: "failure",
              runs: Array.from({ length: 7 }, (_, i) => ({
                name: `check-${i + 1}`,
                state: "failure" as const,
                url: null,
              })),
            },
          });
        },
      },
    );

    expect(result).toEqual([
      {
        number: 1,
        url: "https://github.com/acme/web/pull/1",
        title: "Fix export",
        state: "open",
        checksState: "failing",
        failing: ["check-1", "check-2", "check-3", "check-4", "check-5"],
      },
    ]);
  });
});
