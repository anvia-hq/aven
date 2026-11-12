import { describe, expect, test } from "bun:test";

import { ClaudeRuns } from "./claude-backend";
import { journalPath } from "./testing/journal-path";
import type { ClaudeQuery, ClaudeRunContext } from "./types";

const context = (): ClaudeRunContext => ({
  token: "setup-token-run-end-0001",
  workspace: async () => "/work",
  redact: (text) => text,
  env: [],
  tools: {},
});

const turn = (text: string) =>
  [
    { type: "assistant", session_id: "sess-end", message: { content: [{ type: "text", text }] } },
    {
      type: "result",
      subtype: "success",
      session_id: "sess-end",
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  ] as const;

function likeTheSdk(beforeFirstResult?: Promise<void>): ClaudeQuery {
  return async function* (input) {
    const prompts = input.prompt[Symbol.asyncIterator]();
    await prompts.next();
    await beforeFirstResult;
    yield* turn("one");
    const next = await prompts.next();

    if (next.done) return;

    yield* turn(`two ${next.value}`);
    await prompts.next();
  };
}

function withTimeout<T>(work: Promise<T>) {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("the run never ended")), 3000),
    ),
  ]);
}

describe("a Claude run ends when its answer is complete", () => {
  test("although the SDK keeps waiting for another prompt, as it does in streaming input", async () => {
    const runs = ClaudeRuns.open(journalPath(), likeTheSdk());
    const followed = await runs.start(
      "run-end-1",
      "thread-end-1",
      "go",
      { claude: context() },
      () => undefined,
    );
    const end = await withTimeout(followed.done);
    await runs.close();
    expect(end.type).toBe("response");
  });

  test("a steering message sent before the answer ends is answered first", async () => {
    const release = Promise.withResolvers<void>();
    const runs = ClaudeRuns.open(journalPath(), likeTheSdk(release.promise));
    const followed = await runs.start(
      "run-end-2",
      "thread-end-2",
      "go",
      { claude: context() },
      () => undefined,
    );
    await runs.steer(followed.durableId, "and this");
    release.resolve();
    const end = await withTimeout(followed.done);
    await runs.close();
    expect(end.type).toBe("response");
    expect(JSON.stringify(end)).toContain("two and this");
  });
});
