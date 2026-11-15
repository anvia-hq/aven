import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useClaudeSetup } from "@/modules/claude-setup/hooks/use-claude-setup";
import { useCodexSetup } from "@/modules/codex-setup/hooks/use-codex-setup";
import { usePlatformConfig } from "@/modules/platform/hooks/use-platform-config";
import { AddProjectDialog } from "@/modules/projects/components/add-project-dialog";
import { ProjectPicker } from "@/modules/projects/components/project-picker";
import { RuntimePicker } from "@/modules/runtimes/components/runtime-picker";
import { useRuntimeChoice } from "@/modules/runtimes/hooks/use-runtime-choice";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import type {
  ClaudeChoice,
  CodexChoice,
  OutgoingMessage,
  RunSelection,
} from "@/modules/threads/types";

export const Route = createFileRoute("/_authed/_shell/threads/")({
  validateSearch: (search: Record<string, unknown>): { project?: string } => ({
    project:
      typeof search.project === "string" && search.project !== "" ? search.project : undefined,
  }),
  component: NewThread,
});

function NewThread() {
  const startThread = useStartThread();
  const { projects, loaded } = useProjects();
  const { threads, shared } = useThreads();
  const wide = useMediaQuery("(min-width: 768px)");
  const open = threads.filter((thread) => thread.state === "open");
  const openShared = shared.filter((thread) => thread.state === "open");
  const recent = wide ? open.slice(0, 3) : open;
  const sharedRecent = wide ? openShared.slice(0, 3) : openShared;
  const asked = Route.useSearch().project;
  const [chosen, setProjectId] = useState<string | undefined>(undefined);
  const [claude, setClaude] = useState<ClaudeChoice | null>(null);
  const [codex, setCodex] = useState<CodexChoice | null>(null);
  const credential = useClaudeSetup();
  const codexCredential = useCodexSetup();
  const { config } = usePlatformConfig();
  const claudeOffered = config?.claudeBackend === true;
  const codexOffered = config?.codexBackend === true;
  const projectId = chosen ?? projects.find((project) => project.id === asked)?.id;
  let backend: "native" | "claude" | "codex" = "native";

  if (codexOffered && codex) backend = "codex";
  else if (claudeOffered && claude) backend = "claude";

  const project = projects.find((candidate) => candidate.id === projectId);
  const computer = useRuntimeChoice(project);

  const start = (message: OutgoingMessage, selection: RunSelection) =>
    startThread(projectId, message, selection, backend, computer.runtimeId);

  return (
    <div className="flex min-h-[calc(100svh-var(--mobile-chrome))] flex-col md:min-h-[calc(100svh-2px)]">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 p-4">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
            What should we build?
          </h1>
          <p className="hidden text-sm text-muted-foreground md:block">
            Start a thread inside a project. The agent reads, edits and runs code there.
          </p>
        </div>

        {loaded &&
          (projects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
              <p className="text-sm text-muted-foreground">Add a project to get started.</p>
              <AddProjectDialog onAdded={(project) => setProjectId(project.id)} />
            </div>
          ) : (
            <>
              <PromptInput
                autoFocus
                onSubmit={start}
                claude={claudeOffered ? { choice: claude, onChange: setClaude } : undefined}
                codex={codexOffered ? { choice: codex, onChange: setCodex } : undefined}
                tools={
                  <>
                    <ProjectPicker value={projectId} onChange={setProjectId} />
                    {project && (
                      <RuntimePicker
                        choices={computer.choices}
                        value={computer.runtimeId}
                        onChange={computer.choose}
                      />
                    )}
                  </>
                }
              />
              {claudeOffered && claude && credential.loaded && !credential.setup.configured && (
                <p className="px-1 text-center text-xs text-muted-foreground">
                  <Link to="/settings/claude" className="underline">
                    Set a Claude setup token
                  </Link>{" "}
                  before this thread can run.
                </p>
              )}
              {codexOffered &&
                codex &&
                codexCredential.loaded &&
                !codexCredential.setup.configured && (
                  <p className="px-1 text-center text-xs text-muted-foreground">
                    <Link to="/settings/codex" className="underline">
                      Set a Codex API key
                    </Link>{" "}
                    before this thread can run.
                  </p>
                )}
            </>
          ))}

        <section aria-label="Recent threads" className="flex flex-col gap-1">
          <h3 className="px-3 text-xs font-medium text-muted-foreground">Recent</h3>
          <ThreadList threads={recent} empty="No threads yet." />
        </section>
        {sharedRecent.length > 0 && (
          <section aria-label="Shared with workspace" className="flex flex-col gap-1">
            <h3 className="px-3 text-xs font-medium text-muted-foreground">
              Shared with workspace
            </h3>
            <ThreadList threads={sharedRecent} />
          </section>
        )}
      </main>
    </div>
  );
}
