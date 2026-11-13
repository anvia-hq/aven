import { describe, expect, test } from "bun:test";

import { sentPrompt } from "@aven/agents/attachments";

import { ClaudeRuns } from "./claude-backend";
import { journalPath } from "@aven/agent-backend/testing/journal-path";
import type { ClaudePromptItem, ClaudeQuery, ClaudeRunContext } from "@aven/agent-backend/types";

const context = (): ClaudeRunContext => ({
  token: "setup-token-images-0001",
  workspace: async () => "/work",
  redact: (text) => text,
  env: [],
  tools: {},
});

const picture = (name: string) =>
  sentPrompt("look at this", {
    attachments: [
      {
        name: `${name}.png`,
        mediaType: "image/png",
        size: 4,
        path: `/uploads/${name}.png`,
        image: `${name}.png`,
      },
    ],
    images: new Map([[`${name}.png`, "QUJDRA=="]]),
  });

const turn = (text: string) =>
  [
    { type: "assistant", session_id: "sess-img", message: { content: [{ type: "text", text }] } },
    { type: "result", subtype: "success", session_id: "sess-img" },
  ] as const;

describe("Claude is shown the pictures a person sends", () => {
  test("a picture sent with the first message reaches the query as an image", async () => {
    const seen: ClaudePromptItem[] = [];
    const query: ClaudeQuery = async function* (input) {
      const prompts = input.prompt[Symbol.asyncIterator]();
      const first = await prompts.next();

      if (!first.done) seen.push(first.value);

      yield* turn("one");
    };
    const runs = ClaudeRuns.open(journalPath(), query);
    const followed = await runs.start(
      "img-1",
      "thread-img-1",
      picture("first"),
      { claude: context() },
      () => undefined,
    );
    await followed.done;
    await runs.close();
    const item = seen[0];
    expect(typeof item).toBe("object");
    expect(item).toMatchObject({ images: [{ mediaType: "image/png", data: "QUJDRA==" }] });
  });

  test("a picture sent while it works is the next turn's image when no tool carried it", async () => {
    const release = Promise.withResolvers<void>();
    const seen: ClaudePromptItem[] = [];
    const query: ClaudeQuery = async function* (input) {
      const prompts = input.prompt[Symbol.asyncIterator]();
      await prompts.next();
      await release.promise;
      yield* turn("one");
      const next = await prompts.next();

      if (next.done) return;

      seen.push(next.value);
      yield* turn("two");
      await prompts.next();
    };
    const runs = ClaudeRuns.open(journalPath(), query);
    const followed = await runs.start(
      "img-2",
      "thread-img-2",
      "go",
      { claude: context() },
      () => undefined,
    );
    await runs.steer(followed.durableId, picture("steered"), "steer-1");
    release.resolve();
    await followed.done;
    await runs.close();
    expect(seen[0]).toMatchObject({ images: [{ mediaType: "image/png", data: "QUJDRA==" }] });
  });
});
