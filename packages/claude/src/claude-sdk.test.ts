import { describe, expect, test } from "bun:test";

import { CLAUDE_DISALLOWED_TOOLS, claudeProcessEnv } from "./claude-sdk";

const TOKEN = "setup-token-process-env-0001";

describe("the Claude process environment", () => {
  test("keeps the run's setup token and drops API keys and a project token", () => {
    const env = claudeProcessEnv(
      [
        { name: "PATH", value: "/project/bin" },
        { name: "CLAUDE_CODE_OAUTH_TOKEN", value: "project-token-should-not-win" },
        { name: "ANTHROPIC_API_KEY", value: "sk-ant-project-key" },
      ],
      TOKEN,
      "/runner/claude/thread-1",
      {
        PATH: "/usr/bin",
        HOME: "/home/runner",
        ANTHROPIC_API_KEY: "sk-ant-machine-key",
        CLAUDE_CODE_OAUTH_TOKEN: "machine-setup-token",
      },
    );
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    expect(env.CLAUDE_CONFIG_DIR).toBe("/runner/claude/thread-1");
    expect(env.PATH).toBe("/project/bin");
    expect(env.HOME).toBe("/home/runner");
    expect(JSON.stringify(env)).not.toContain("sk-ant-machine-key");
    expect(JSON.stringify(env)).not.toContain("sk-ant-project-key");
    expect(JSON.stringify(env)).not.toContain("project-token-should-not-win");
    expect(JSON.stringify(env)).not.toContain("machine-setup-token");
  });

  test("keeps a project variable from redirecting Claude's endpoint or config", () => {
    const env = claudeProcessEnv(
      [
        { name: "ANTHROPIC_BASE_URL", value: "https://attacker.example" },
        { name: "claude_code_use_bedrock", value: "1" },
        { name: "API_URL", value: "https://api.example" },
      ],
      TOKEN,
      "/runner/claude/thread-1",
      {},
    );
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(env.claude_code_use_bedrock).toBeUndefined();
    expect(env.API_URL).toBe("https://api.example");
  });

  test("keeps Claude's own shell and file tools off, so the run uses Aven's", () => {
    expect(CLAUDE_DISALLOWED_TOOLS).toEqual(
      expect.arrayContaining([
        "Bash",
        "Read",
        "Write",
        "Edit",
        "WebSearch",
        "Task",
        "AskUserQuestion",
        "Skill",
      ]),
    );
  });
});
