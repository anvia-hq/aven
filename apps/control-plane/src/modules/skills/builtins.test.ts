import { describe, expect, test } from "bun:test";
import { readSkillFolders } from "@aven/agents/skills";
import {
  ADD_MCP_SERVER_TOOL_NAME,
  LIST_MCP_SERVERS_TOOL_NAME,
  REMOVE_MCP_SERVER_TOOL_NAME,
  UPDATE_MCP_SERVER_TOOL_NAME,
} from "@aven/agents/tools/mcp-servers";
import {
  ADD_PROVIDER_TOOL_NAME,
  ASK_PROVIDER_KEY_TOOL_NAME,
  LIST_PROVIDER_MODELS_TOOL_NAME,
  LIST_PROVIDERS_TOOL_NAME,
  REMOVE_PROVIDER_TOOL_NAME,
  UPDATE_PROVIDER_TOOL_NAME,
} from "@aven/agents/tools/providers";
import {
  ARCHIVE_THREAD_TOOL_NAME,
  CONTINUE_THREAD_TOOL_NAME,
  GET_THREAD_TOOL_NAME,
  LIST_PROJECTS_TOOL_NAME,
  LIST_THREADS_TOOL_NAME,
  START_THREAD_TOOL_NAME,
} from "@aven/agents/tools/threads";
import { join } from "node:path";

import { BUILTIN_SKILLS_DIR } from "./builtins";

describe("the built-in skills", () => {
  test("every folder is a valid skill, and these are the ones there are", async () => {
    const { skills, problems } = await readSkillFolders(BUILTIN_SKILLS_DIR);

    expect(problems).toEqual([]);
    expect(skills.map((skill) => skill.name).sort()).toEqual([
      "aven-help",
      "configure-bots",
      "configure-mcp",
      "configure-providers",
      "configure-variables",
      "connect-github-and-runners",
      "setup-env",
      "setup-ship",
      "use-identity-tokens",
      "writing-skills",
    ]);
    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(40);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
    }
  });

  const text = (name: string) => Bun.file(join(BUILTIN_SKILLS_DIR, name, "SKILL.md")).text();

  test("the provider and MCP skills name the tools a bot has", async () => {
    const providers = await text("configure-providers");
    for (const tool of [
      LIST_PROVIDERS_TOOL_NAME,
      ADD_PROVIDER_TOOL_NAME,
      UPDATE_PROVIDER_TOOL_NAME,
      REMOVE_PROVIDER_TOOL_NAME,
      LIST_PROVIDER_MODELS_TOOL_NAME,
      ASK_PROVIDER_KEY_TOOL_NAME,
    ]) {
      expect(providers).toContain(`\`${tool}\``);
    }
    const mcp = await text("configure-mcp");
    for (const tool of [
      LIST_MCP_SERVERS_TOOL_NAME,
      ADD_MCP_SERVER_TOOL_NAME,
      UPDATE_MCP_SERVER_TOOL_NAME,
      REMOVE_MCP_SERVER_TOOL_NAME,
    ]) {
      expect(mcp).toContain(`\`${tool}\``);
    }
  });

  test("the bots skill names the tools a bot has for threads (decision 0088)", async () => {
    const bots = await text("configure-bots");
    for (const tool of [
      LIST_PROJECTS_TOOL_NAME,
      LIST_THREADS_TOOL_NAME,
      GET_THREAD_TOOL_NAME,
      START_THREAD_TOOL_NAME,
      CONTINUE_THREAD_TOOL_NAME,
      ARCHIVE_THREAD_TOOL_NAME,
    ]) {
      expect(bots).toContain(`\`${tool}\``);
    }
  });

  test("the help skill points only at skills there are, and at each of the others", async () => {
    const { skills } = await readSkillFolders(BUILTIN_SKILLS_DIR);
    const names = new Set(skills.map((skill) => skill.name));
    const help = await text("aven-help");
    const pointed = [...help.matchAll(/`([a-z0-9]+(?:-[a-z0-9]+)+)`/g)]
      .map((match) => match[1]!)
      .filter((name) => !name.includes("_"));
    expect(pointed.length).toBeGreaterThan(0);
    for (const name of pointed) expect(names.has(name)).toBe(true);
    for (const name of names) {
      if (name !== "aven-help") expect(help).toContain(`\`${name}\``);
    }
  });
});
