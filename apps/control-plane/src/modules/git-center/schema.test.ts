import { describe, expect, test } from "bun:test";

import {
  createPullBody,
  gitActionBody,
  handoffBody,
  mergePullBody,
  reviewPullBody,
  workspaceQuery,
} from "./schema";

describe("git-center schemas", () => {
  test("accepts valid git actions and rejects malformed targets or SHAs", () => {
    expect(
      gitActionBody.safeParse({
        target: { kind: "project" },
        action: { op: "commit", message: "feat: add git center", signoff: true },
      }).success,
    ).toBe(true);

    expect(
      gitActionBody.safeParse({
        target: { kind: "thread", threadId: "not-a-uuid" },
        action: { op: "fetch" },
      }).success,
    ).toBe(false);

    expect(
      gitActionBody.safeParse({
        target: { kind: "project" },
        action: { op: "cherryPick", sha: "not-hex!" },
      }).success,
    ).toBe(false);
  });

  test("validates PR controls, workspace query transforms, and agent handoffs", () => {
    expect(workspaceQuery.parse({ staged: "1" }).staged).toBe(true);
    expect(workspaceQuery.parse({ staged: "0" }).staged).toBe(false);

    expect(
      createPullBody.safeParse({ title: "Ship it", head: "feat/x", base: "main", draft: true })
        .success,
    ).toBe(true);
    expect(reviewPullBody.safeParse({ event: "APPROVE", body: "Looks good" }).success).toBe(true);
    expect(mergePullBody.safeParse({ method: "enqueue" }).success).toBe(true);

    expect(
      handoffBody.safeParse({
        kind: "fix_ci",
        pullNumber: 464,
        branch: "feat/git-center",
        checkName: "unit tests",
      }).success,
    ).toBe(true);
  });
});
