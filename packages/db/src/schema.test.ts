import { describe, expect, test } from "bun:test";

import { getTableConfig } from "drizzle-orm/pg-core";

import { TASK_PRIORITIES, TASK_STATUSES } from "@aven/protocol/cockpit";
import { MCP_TARGETS } from "@aven/protocol/mcp";
import { MEMORY_SCOPES } from "@aven/protocol/memory";
import {
  AGENT_BACKENDS,
  BOAT_MACHINE_TYPES,
  PROVIDERS,
  RUNTIME_GITHUB_MODES,
  RUNTIME_LIFETIMES,
  RUNTIME_PROVIDERS,
} from "@aven/protocol/runtime-wire";

import { cockpitTasks } from "./schema/cockpit-tasks";
import { githubInstallations } from "./schema/github-installations";
import { mcpServers } from "./schema/mcp-servers";
import { memoryEvents } from "./schema/memory-events";
import { memoryNotes } from "./schema/memory-notes";
import { providers } from "./schema/providers";
import { runtimes } from "./schema/runtimes";
import { skills } from "./schema/skills";
import { threadContextSplits } from "./schema/thread-context-splits";
import { threadMentions } from "./schema/thread-mentions";
import { threadPins } from "./schema/thread-pins";
import { threadPlanLimits } from "./schema/thread-plan-limits";
import { threadPullRequests } from "./schema/thread-pull-requests";
import { threads } from "./schema/threads";
import { userAvatars } from "./schema/user-avatars";

describe("schema definitions", () => {
  test("enum columns match @aven/protocol constants", () => {
    expect(cockpitTasks.status.enumValues).toEqual([...TASK_STATUSES]);
    expect(cockpitTasks.priority.enumValues).toEqual([...TASK_PRIORITIES]);
    expect(mcpServers.target.enumValues).toEqual([...MCP_TARGETS]);
    expect(memoryNotes.scope.enumValues).toEqual([...MEMORY_SCOPES]);
    expect(memoryEvents.scope.enumValues).toEqual([...MEMORY_SCOPES]);
    expect(providers.kind.enumValues).toEqual([...PROVIDERS]);
    expect(runtimes.provider.enumValues).toEqual([...RUNTIME_PROVIDERS]);
    expect(runtimes.lifetime.enumValues).toEqual([...RUNTIME_LIFETIMES]);
    expect(runtimes.githubMode.enumValues).toEqual([...RUNTIME_GITHUB_MODES]);
    expect(runtimes.boatMachineType.enumValues).toEqual([...BOAT_MACHINE_TYPES]);
    expect(threads.agentBackend.enumValues).toEqual([...AGENT_BACKENDS]);
  });

  test("bytea columns use the shared bytea custom type", () => {
    expect(skills.archive.getSQLType()).toBe("bytea");
    expect(userAvatars.data.getSQLType()).toBe("bytea");

    const raw = Buffer.from([1, 2, 3]);
    const fromSkills = skills.archive.mapFromDriverValue(raw);
    const fromAvatars = userAvatars.data.mapFromDriverValue(raw);
    expect(fromSkills).toBeInstanceOf(Uint8Array);
    expect(fromAvatars).toBeInstanceOf(Uint8Array);
    expect(fromSkills).toEqual(new Uint8Array([1, 2, 3]));
    expect(fromAvatars).toEqual(new Uint8Array([1, 2, 3]));
  });

  test("updatedAt columns define onUpdate hooks on threadContextSplits and threadPlanLimits", () => {
    expect(threadContextSplits.updatedAt.onUpdateFn?.()).toBeInstanceOf(Date);
    expect(threadPlanLimits.updatedAt.onUpdateFn?.()).toBeInstanceOf(Date);
  });

  test("indexes match cleaned-up definitions", () => {
    const indexNames = (table: Parameters<typeof getTableConfig>[0]) =>
      getTableConfig(table).indexes.map((idx) => idx.config.name);

    expect(indexNames(mcpServers)).toEqual(["mcp_servers_user_slug_idx"]);
    expect(indexNames(threadPullRequests)).toEqual([]);
    expect(indexNames(githubInstallations)).toEqual(["github_installations_org_installation_idx"]);
    expect(indexNames(threadMentions)).toEqual(["thread_mentions_user_idx"]);
    expect(indexNames(threadPins)).toEqual(["thread_pins_user_idx"]);
  });
});
