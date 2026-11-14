import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ArtifactStore } from "../artifacts";
import { DirectorySandbox } from "../directory-sandbox";
import { SkillStore } from "../skills";
import { UploadStore } from "../uploads";
import { threadProcesses } from "../thread-processes";
import { hasRunningProcesses, sandboxTools } from "../thread-tools";
import type { ThreadSandbox, ThreadWorkspaces } from "../types";

export function directoryWorkspaces(seed?: (root: string) => Promise<void>): ThreadWorkspaces & {
  roots: Map<string, string>;
  sandboxes: Map<string, DirectorySandbox>;
  artifacts: ArtifactStore;
  uploads: UploadStore;
  skills: SkillStore;
} {
  const roots = new Map<string, string>();
  const sandboxes = new Map<string, DirectorySandbox>();
  const artifacts = new ArtifactStore(
    join(tmpdir(), `aven-directory-artifacts-${crypto.randomUUID()}`),
  );
  const uploads = new UploadStore(join(tmpdir(), `aven-directory-uploads-${crypto.randomUUID()}`));
  const skills = new SkillStore(join(tmpdir(), `aven-directory-skills-${crypto.randomUUID()}`));
  const free = async (threadId: string) => {
    await sandboxes.get(threadId)?.dispose();
    sandboxes.delete(threadId);
    const root = roots.get(threadId);
    roots.delete(threadId);

    if (root) await rm(root, { recursive: true, force: true });
  };
  return {
    roots,
    sandboxes,
    async acquire(thread): Promise<ThreadSandbox> {
      let sandbox = sandboxes.get(thread.id);

      if (!sandbox) {
        const root = await realpath(await mkdtemp(join(tmpdir(), "aven-directory-workspace-")));
        roots.set(thread.id, root);
        await seed?.(root);
        sandbox = new DirectorySandbox(thread.id, root);
        sandboxes.set(thread.id, sandbox);
      }

      const current = sandbox;
      return {
        tools: sandboxTools(current, { id: thread.id, artifacts }),
        runtime: current,
        hasRunningProcesses: () => hasRunningProcesses(current),
        processes: threadProcesses(current, () => true),
      };
    },
    artifacts,
    uploads,
    skills,
    workspace: async (threadId) => roots.get(threadId),
    release: free,
    async dispose() {
      await Promise.all([...sandboxes.keys()].map(free));
      await rm(artifacts.root, { recursive: true, force: true });
      await rm(uploads.root, { recursive: true, force: true });
      await rm(skills.root, { recursive: true, force: true });
    },
  };
}
