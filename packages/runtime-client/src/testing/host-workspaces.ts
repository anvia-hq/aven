import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hostLauncher } from "@aven/agents/jobs/job-registry";

import type { ThreadSandbox, ThreadWorkspaces } from "../sandbox";

// FOR TESTS ONLY: gives each thread a temporary directory and runs its commands directly on this
// machine, with no container. A real runner always uses `Sandboxes`.
export function hostWorkspaces(
  /** Puts files in a new workspace before the first run. */
  seed?: (root: string) => Promise<void>,
): ThreadWorkspaces & { roots: Map<string, string> } {
  const roots = new Map<string, string>();
  return {
    roots,
    async acquire(thread): Promise<ThreadSandbox> {
      let root = roots.get(thread.id);
      if (!root) {
        root = await realpath(await mkdtemp(join(tmpdir(), "aven-host-workspace-")));
        roots.set(thread.id, root);
        await seed?.(root);
      }
      return { root, launcher: hostLauncher, tools: [] };
    },
    async dispose() {
      await Promise.all(
        [...roots.values()].map((root) => rm(root, { recursive: true, force: true })),
      );
      roots.clear();
    },
  };
}
