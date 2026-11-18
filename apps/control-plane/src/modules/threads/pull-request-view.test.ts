import { describe, expect, test } from "bun:test";

import {
  PULL_REQUEST_COMMENT_CHARS,
  PULL_REQUEST_COMMENTS_MAX,
  PULL_REQUEST_FILES_MAX,
  PULL_REQUEST_FAILING_MAX,
  PULL_REQUESTS_DETAILED,
  pullRequestViews,
} from "./pull-request-view";
import type { PullRequestSource } from "./types";
import type { GithubPullDetail } from "@aven/github/types";
import type { BotThreadPullRequest } from "@aven/protocol/types";

const pull = (number: number): BotThreadPullRequest => ({
  number,
  url: `https://github.com/acme/web/pull/${number}`,
  title: "Add search",
  state: "open",
});

const detail = (changes: Partial<GithubPullDetail> = {}): GithubPullDetail => ({
  number: 1,
  title: "Add <b>search</b>",
  body: "",
  url: "u",
  status: "open",
  author: "ada",
  base: "main",
  head: "aven/x",
  additions: 40,
  deletions: 2,
  changedFiles: 2,
  commits: 1,
  comments: 0,
  createdAt: "",
  updatedAt: "",
  mergeable: true,
  reviews: [],
  requestedReviewers: [],
  checks: { state: "none", runs: [] },
  files: [
    { path: "a.ts", oldPath: null, status: "added", additions: 30, deletions: 0, patch: "SECRET" },
    { path: "b.ts", oldPath: null, status: "modified", additions: 10, deletions: 2, patch: null },
  ],
  filesTruncated: false,
  ...changes,
});

const source = (over: Partial<PullRequestSource> = {}): PullRequestSource => ({
  pull: async () => detail(),
  comments: async () => [],
  ...over,
});

describe("pullRequestViews", () => {
  test("gives state, checks with failing names, review, comments and files without diffs", async () => {
    const [view] = await pullRequestViews(
      source({
        pull: async () =>
          detail({
            status: "draft",
            reviews: [
              { login: "bob", state: "approved" },
              { login: "cy", state: "changes_requested" },
            ],
            requestedReviewers: ["dee"],
            checks: {
              state: "failure",
              runs: [
                { name: "lint", state: "success", url: null },
                { name: "test <unit>", state: "failure", url: null },
                { name: "e2e", state: "pending", url: null },
              ],
            },
          }),
        comments: async () => [
          { author: "cy", path: "a.ts", text: "Please\nrename\n<this>", outdated: false },
        ],
      }),
      [pull(1)],
    );
    expect(view).toMatchObject({
      number: 1,
      title: "Add bsearch/b",
      state: "draft",
      checks: { state: "failing", failing: ["test unit"], failingMore: 0 },
      review: { state: "changes_requested", requested: ["dee"] },
      unresolvedComments: [{ author: "cy", path: "a.ts", text: "Please rename this" }],
      unresolvedCommentsMore: 0,
      files: [
        { path: "a.ts", status: "added", additions: 30, deletions: 0 },
        { path: "b.ts", status: "modified", additions: 10, deletions: 2 },
      ],
      additions: 40,
      deletions: 2,
    });
    expect(JSON.stringify(view)).not.toContain("SECRET");
    expect(view?.omitted).toBeUndefined();
  });

  test("caps comments, their text, files, failing names and the pull requests looked at", async () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      name: `check-${index}`,
      state: "failure" as const,
      url: null,
    }));
    let looked = 0;
    const views = await pullRequestViews(
      source({
        pull: async () => {
          looked += 1;
          return detail({
            changedFiles: 100,
            files: Array.from({ length: 100 }, (_, index) => ({
              path: `f${index}`,
              oldPath: null,
              status: "modified" as const,
              additions: 1,
              deletions: 0,
              patch: null,
            })),
            checks: { state: "failure", runs: many },
          });
        },
        comments: async () =>
          Array.from({ length: 25 }, () => ({
            author: "cy",
            path: "a.ts",
            text: "x".repeat(5000),
            outdated: false,
          })),
      }),
      Array.from({ length: 9 }, (_, index) => pull(index + 1)),
    );
    expect(views).toHaveLength(PULL_REQUESTS_DETAILED);
    expect(looked).toBe(PULL_REQUESTS_DETAILED);
    const first = views[0]!;
    expect(first.unresolvedComments).toHaveLength(PULL_REQUEST_COMMENTS_MAX);
    expect(first.unresolvedCommentsMore).toBe(15);
    expect(first.unresolvedComments![0]!.text).toHaveLength(PULL_REQUEST_COMMENT_CHARS);
    expect(first.files).toHaveLength(PULL_REQUEST_FILES_MAX);
    expect(first.filesMore).toBe(70);
    expect(first.checks?.failing).toHaveLength(PULL_REQUEST_FAILING_MAX);
    expect(first.checks?.failingMore).toBe(30);
  });

  test("a GitHub failure or a slow answer omits the part with a reason and never throws", async () => {
    const failed = await pullRequestViews(
      source({
        pull: async () => {
          throw new Error("boom: token ghs_secret");
        },
      }),
      [pull(1)],
    );
    expect(failed[0]).toMatchObject({ number: 1, state: "open", title: "Add search" });
    expect(failed[0]?.omitted).toHaveLength(1);
    expect(JSON.stringify(failed)).not.toContain("ghs_secret");
    expect(failed[0]?.checks).toBeUndefined();

    const slow = await pullRequestViews(
      source({ pull: () => new Promise(() => undefined) }),
      [pull(2)],
      5,
    );
    expect(slow[0]?.omitted).toHaveLength(1);

    const noComments = await pullRequestViews(
      source({
        comments: async () => {
          throw new Error("graphql down");
        },
      }),
      [pull(3)],
    );
    expect(noComments[0]?.checks?.state).toBe("none");
    expect(noComments[0]?.unresolvedComments).toBeUndefined();
    expect(noComments[0]?.omitted).toHaveLength(1);

    const gone = await pullRequestViews(source({ pull: async () => null }), [pull(4)]);
    expect(gone[0]?.omitted).toHaveLength(1);
  });
});
