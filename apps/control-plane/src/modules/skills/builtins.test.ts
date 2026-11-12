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
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseActions } from "../actions/parse";
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
      "setup-actions",
      "setup-env",
      "setup-ship",
      "writing-skills",
    ]);
    for (const skill of skills) {
      expect(skill.description.length).toBeGreaterThan(40);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
    }
  });

  const text = (name: string) => Bun.file(join(BUILTIN_SKILLS_DIR, name, "SKILL.md")).text();

  test("the example of the actions skill is a file the actions parser accepts", async () => {
    const example = /```yaml\n([\s\S]*?)```/.exec(await text("setup-actions"))?.[1];
    const parsed = parseActions(example ?? "");

    expect(parsed.problem).toBeNull();
    expect(parsed.actions.map((action) => action.kind)).toEqual(["run", "run", "prompt"]);
  });

  test("the example of the environment skill is an action the parser accepts, and its script is valid bash", async () => {
    const skill = await text("setup-env");
    const action = parseActions(/```yaml\n([\s\S]*?)```/.exec(skill)?.[1] ?? "");
    expect(action.problem).toBeNull();
    expect(action.actions).toEqual([
      expect.objectContaining({ name: "Set up", kind: "run", body: "bash .aven/setup" }),
    ]);

    const script = /```bash\n([\s\S]*?)```/.exec(skill)?.[1] ?? "";
    expect(script.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    const checked = Bun.spawnSync(["bash", "-n"], { stdin: new TextEncoder().encode(script) });
    expect(checked.exitCode).toBe(0);
  });

  test("the environment skill's script, run with a bare PATH, finds a tool it put on the PATH itself and says what is missing", async () => {
    const script = /```bash\n([\s\S]*?)```/.exec(await text("setup-env"))?.[1] ?? "";
    const root = await mkdtemp(join(tmpdir(), "aven-setup-env-"));
    try {
      await mkdir(join(root, ".aven"));
      await writeFile(
        join(root, ".aven", "setup"),
        script.replace("need bun ", "need nosuchtool "),
      );
      const run = Bun.spawnSync([
        "/usr/bin/env",
        "-i",
        `HOME=${root}`,
        "PATH=/usr/bin:/bin",
        "bash",
        join(root, ".aven", "setup"),
      ]);
      const out = run.stdout.toString();
      expect(run.exitCode).toBe(1);
      expect(out).toContain("missing  nosuchtool: ");
      expect(out).toContain("Install what is missing above");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

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
