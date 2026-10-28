import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { toast } from "@/components/toast";
import { NewProjectDialog } from "@/modules/projects/components/new-project-dialog";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { PromptInput } from "@/modules/threads/components/prompt-input";
import { ThreadList } from "@/modules/threads/components/thread-list";
import { useStartThread } from "@/modules/threads/hooks/use-start-thread";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import { SUGGESTIONS } from "@/modules/threads/types";

export const Route = createFileRoute("/_authed/threads/")({
  component: NewThread,
});

// Every thread belongs to a project; this picks which one a new thread starts in. Used only
// here, so it stays local rather than living as its own module component.
function ProjectPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (projectId: string) => void;
}) {
  const { projects } = useProjects();

  return (
    <div className="flex items-center gap-2">
      <Select value={value ?? ""} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger aria-label="Project" className="w-full">
          <SelectValue placeholder="Choose a project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <NewProjectDialog onCreated={(project) => onChange(project.id)} />
    </div>
  );
}

function NewThread() {
  const startThread = useStartThread();
  const { projects, loaded } = useProjects();
  const recent = useThreads().threads.slice(0, 3);
  const [projectId, setProjectId] = useState<string | undefined>(undefined);

  function start(prompt: string) {
    if (!projectId) {
      toast.add({ title: "Choose a project first", type: "error" });
      return;
    }
    void startThread(projectId, prompt);
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col justify-center gap-10 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-semibold tracking-tight">What should we build?</h1>
        <p className="text-base text-muted-foreground">
          Start a thread inside a project. The agent reads, edits and runs code there.
        </p>
      </div>

      {loaded && projects.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">Create a project to get started.</p>
          <NewProjectDialog onCreated={(project) => setProjectId(project.id)} />
        </div>
      ) : (
        <>
          <ProjectPicker value={projectId} onChange={setProjectId} />

          <PromptInput autoFocus onSubmit={start} />

          <div className="flex flex-wrap gap-2" aria-label="Suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                className="rounded-full font-normal text-muted-foreground"
                onClick={() => start(suggestion)}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </>
      )}

      <section aria-label="Recent threads" className="flex flex-col gap-3">
        <h2 className="text-sm text-muted-foreground">Recent</h2>
        <ThreadList threads={recent} empty="No threads yet." />
      </section>
    </main>
  );
}
