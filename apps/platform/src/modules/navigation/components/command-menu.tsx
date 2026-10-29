import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/command";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import { useThreads } from "@/modules/threads/hooks/use-threads";
import { useCommandMenu } from "../hooks/use-command-menu";

const pages = [
  { label: "New thread", to: "/threads" },
  { label: "Projects", to: "/projects" },
  { label: "Personal settings", to: "/settings/profile" },
  { label: "Workspace members", to: "/settings/members" },
] as const;

export function CommandMenu() {
  const { open, setOpen } = useCommandMenu();
  const { threads } = useThreads();
  const { projects } = useProjects();
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === ",") {
        event.preventDefault();
        void navigate({ to: "/settings/profile" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, setOpen]);

  function go(action: () => Promise<void>) {
    setOpen(false);
    void action();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Jump to a page, thread or project."
    >
      <Command>
        <CommandInput placeholder="Search threads, projects and pages…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Pages">
            {pages.map((page) => (
              <CommandItem key={page.to} onSelect={() => go(() => navigate({ to: page.to }))}>
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Threads">
            {threads.map((thread) => (
              <CommandItem
                key={thread.id}
                value={`thread ${thread.title}`}
                onSelect={() =>
                  go(() => navigate({ to: "/threads/$threadId", params: { threadId: thread.id } }))
                }
              >
                {thread.title}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Projects">
            {projects.map((project) => (
              <CommandItem
                key={project.id}
                value={`project ${project.name}`}
                onSelect={() =>
                  go(() =>
                    navigate({ to: "/projects/$projectId", params: { projectId: project.id } }),
                  )
                }
              >
                {project.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
