import { describe, expect, test } from "bun:test";

import { GithubClient } from "./client";

const TEST_CONFIG = {
  appId: "1",
  privateKey: "unused",
  slug: "aven",
  clientId: "cid",
  clientSecret: "csec",
  apiUrl: "https://api.github.test",
  webUrl: "https://github.test",
};

describe("GithubClient pull request controls", () => {
  test("creates, reviews, updates, merges, enqueues, and closes pull requests", async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    const client = new GithubClient(TEST_CONFIG, async (url, init) => {
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });

      if (url.endsWith("/pulls") && method === "POST") {
        return Response.json({
          number: 42,
          html_url: "https://github.test/org/repo/pull/42",
          title: "Add Git Center",
          state: "open",
          merged_at: null,
          head: { ref: "feat/git-center", repo: { full_name: "org/repo" } },
        });
      }

      if (url.endsWith("/pulls/42/reviews")) {
        return Response.json({ id: 1 });
      }

      if (url.endsWith("/pulls/42/update-branch")) {
        return Response.json({ message: "Updating pull request branch." });
      }

      if (url.endsWith("/pulls/42/merge")) {
        return Response.json({
          merged: true,
          message: "Pull Request successfully merged",
          sha: "abc",
        });
      }

      if (url.endsWith("/pulls/42") && method === "GET") {
        return Response.json({
          number: 42,
          node_id: "PR_node_42",
          title: "Add Git Center",
          body: "",
          html_url: "https://github.test/org/repo/pull/42",
          state: "open",
          user: { login: "alice" },
          base: { ref: "main" },
          head: { ref: "feat/git-center", sha: "deadbeef" },
          additions: 1,
          deletions: 0,
          changed_files: 1,
          commits: 1,
          comments: 0,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          mergeable: true,
        });
      }

      if (url.endsWith("/graphql")) {
        return Response.json({
          data: { enqueuePullRequest: { mergeQueueEntry: { id: "MQE_1", state: "QUEUED" } } },
        });
      }

      if (url.endsWith("/pulls/42") && method === "PATCH") {
        return Response.json({
          number: 42,
          html_url: "https://github.test/org/repo/pull/42",
          title: "Add Git Center",
          state: "closed",
          merged_at: null,
          head: { ref: "feat/git-center", repo: { full_name: "org/repo" } },
        });
      }

      if (url.endsWith("/check-runs/77")) {
        return Response.json({
          id: 77,
          name: "unit tests",
          status: "completed",
          conclusion: "failure",
          html_url: "https://github.test/org/repo/runs/77",
          output: { title: "1 test failed", summary: "assertion failed", text: "details" },
        });
      }

      if (url.endsWith("/actions/jobs/77/logs")) {
        return new Response("FAIL src/app.test.ts\n");
      }

      return new Response("not found", { status: 404 });
    });

    const created = await client.createPull("tok", "org/repo", {
      title: "Add Git Center",
      head: "feat/git-center",
      base: "main",
    });
    expect(created.number).toBe(42);

    const reviewed = await client.reviewPull("tok", "org/repo", 42, {
      event: "APPROVE",
      body: "LGTM",
    });
    expect(reviewed.ok).toBe(true);

    const updated = await client.updatePullBranch("tok", "org/repo", 42);
    expect(updated.message).toContain("Updating");

    const merged = await client.mergePull("tok", "org/repo", 42, { method: "squash" });
    expect(merged.merged).toBe(true);
    expect(merged.queued).toBe(false);

    const queued = await client.mergePull("tok", "org/repo", 42, { method: "enqueue" });
    expect(queued.queued).toBe(true);

    const closed = await client.updatePullState("tok", "org/repo", 42, "closed");
    expect(closed.state).toBe("closed");

    const logs = await client.checkRunLogs("tok", "org/repo", 77);
    expect(logs.name).toBe("unit tests");
    expect(logs.logs).toContain("FAIL src/app.test.ts");
    expect(calls.length).toBeGreaterThanOrEqual(8);
  });
});
