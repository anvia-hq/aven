import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";

import { journalPath } from "@aven/agent-backend/testing/journal-path";
import { openAgentBackends } from "./agent-backends";
import type { AgentBackendSet } from "@aven/agent-backend/types";

const open: AgentBackendSet[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((backends) => backends.close()));
});

describe("openAgentBackends", () => {
  test("a native backend that failed to open is opened again by the next run", async () => {
    const path = journalPath();
    const logged = spyOn(console, "error").mockImplementation(() => undefined);
    mkdirSync(`${path}.state`);

    try {
      const backends = openAgentBackends(path, new Set());
      open.push(backends);

      await expect(backends.get("native")).rejects.toThrow("unable to open database file");
      expect(logged.mock.calls.flat().join(" ")).toContain(
        "The native agent backend could not open its journal",
      );

      rmSync(`${path}.state`, { recursive: true });

      expect((await backends.get("native")).kind).toBe("native");
      expect((await backends.get(undefined)).kind).toBe("native");
    } finally {
      logged.mockRestore();
    }
  });
});
