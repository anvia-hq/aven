import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CLAUDE_EFFORTS, CLAUDE_MODELS } from "@aven/protocol/claude-models";

const hostEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^(ANTHROPIC_|CLAUDE_)/i.test(name)),
  );

describe("the Claude model table against the SDK", () => {
  test("every alias resolves to the version and offers the efforts the table says", async () => {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const prompts: AsyncIterable<never> = {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}) }),
    };
    const q = query({
      prompt: prompts,
      options: {
        cwd: process.cwd(),
        env: {
          ...hostEnv(),
          CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-table",
          CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "aven-claude-table-")),
        },
        settingSources: [],
        tools: [],
      },
    });
    try {
      const listed = await q.supportedModels();

      for (const model of CLAUDE_MODELS) {
        const found = listed.find((item) => item.value === model.id);
        expect(found?.resolvedModel).toBe(model.resolved);
        expect(found?.supportedEffortLevels).toEqual([...CLAUDE_EFFORTS]);
      }
    } finally {
      q.close();
    }
  }, 30_000);
});
