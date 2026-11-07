import { Archive, Plus, Share } from "@mynaui/icons-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/sidebar";
import { shortTimeAgo, timeAgo } from "@/lib/format";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { useProjectPalettes } from "@/modules/projects/hooks/use-project-palettes";
import { useProjects } from "@/modules/projects/hooks/use-projects";
import type { Project } from "@/modules/projects/types";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { nestForks } from "../fork-nesting";
import { useArchiveThread } from "../hooks/use-archive-thread";
import { useFinishedSound } from "../hooks/use-finished-sound";
import { useRenameThread } from "../hooks/use-rename-thread";
import { useThreads } from "../hooks/use-threads";
import type { Thread } from "../types";

const RUNNING_REFRESH_MS = 5000;

// The thread's project as a tile, which takes the project's colors and turns while the thread runs.
// Until the project is known the tile's place is kept, so a row does not change when it arrives.
function SidebarProjectTile({
  thread,
  project,
  palette,
}: {
  thread: Thread;
  project?: Project;
  palette?: number;
}) {
  if (!project) return <span className="size-5 shrink-0" aria-hidden />;
  return <ProjectTile projectId={project.id} palette={palette} working={thread.running} />;
}

// When the thread last changed, in the place the Archive button takes at the row's end: centred on
// it, so on hover the button is drawn where the time was. Outside the row's link, which keeps that
// room free, and not something to click. Below `md` the button is always shown, so the time is not.
function UpdatedAt({ thread, yields = false }: { thread: Thread; yields?: boolean }) {
  return (
    <time
      dateTime={thread.updatedAt}
      title={timeAgo(thread.updatedAt, true)}
      className={cn(
        "pointer-events-none absolute inset-y-0 right-2 flex w-5 items-center justify-center text-xs whitespace-nowrap text-muted-foreground tabular-nums group-data-[collapsible=icon]:hidden",
        yields &&
          "group-hover/menu-item:opacity-0 group-has-focus-visible/menu-item:opacity-0 max-md:hidden",
      )}
    >
      {shortTimeAgo(thread.updatedAt)}
    </time>
  );
}

// Beside the project's tile, for a thread shared with the workspace (decision 0084).
function SharedMark({ thread }: { thread: Thread }) {
  if (thread.visibility !== "workspace") return null;
  return <Share role="img" aria-label="Shared with workspace" className="text-muted-foreground" />;
}

// Beside the title of a thread an agent forked from another (decision 0135), under that one.
function ForkBadge({ thread }: { thread: Thread }) {
  if (!thread.parentThreadId) return null;
  return (
    <Badge variant="outline" className="h-4 px-1 text-[10px]">
      Fork
    </Badge>
  );
}

// The field a title is edited in: Enter or leaving it keeps the new title and Escape the old one.
// It is made again for each edit, so each one is finished once.
function TitleField({ title, onDone }: { title: string; onDone: (title?: string) => void }) {
  const finished = useRef(false);
  const finish = (value?: string) => {
    if (finished.current) return;
    finished.current = true;
    onDone(value);
  };
  return (
    <Input
      autoFocus
      aria-label="Thread title"
      defaultValue={title}
      maxLength={200}
      className="h-6 flex-1 px-1.5 text-sm"
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") finish();
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  );
}

// The title of a thread of the person's own: a double click turns it into a field.
function ThreadTitle({
  thread,
  hint,
  editing,
  onEdit,
  onDone,
}: {
  thread: Thread;
  hint: string;
  editing: boolean;
  onEdit: () => void;
  onDone: (title?: string) => void;
}) {
  if (editing) return <TitleField title={thread.title} onDone={onDone} />;
  return (
    <span
      className="flex-1 truncate"
      title={hint}
      onDoubleClick={(event) => {
        event.preventDefault();
        onEdit();
      }}
    >
      {thread.title}
    </span>
  );
}

export function SidebarThreads() {
  const navigate = useNavigate();
  const { threads: own, shared: others, refresh } = useThreads();
  const threads = own.filter((thread) => thread.state === "open");
  // What the workspace shares to read (decision 0084), which its creator can still archive.
  const shared = others.filter((thread) => thread.state === "open");
  const { runtimes } = useRuntimes();
  const { projects } = useProjects();
  const palettes = useProjectPalettes();
  const archive = useArchiveThread();
  const rename = useRenameThread();
  useFinishedSound();
  const [editing, setEditing] = useState<string | null>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // Only the open thread has a stream to hear its run end on. While a thread is shown as running,
  // the list is asked again now and then, so another thread's dots go when its run ends.
  const anyRunning = [...own, ...others].some((thread) => thread.running);
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => void refresh(), RUNNING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [anyRunning, refresh]);

  function hostLabel(thread: Thread) {
    const host = runtimes.find((runtime) => runtime.id === thread.runtimeId)?.name ?? "a runner";
    return `${thread.running ? "Running" : "Hosted"} on ${host}`;
  }

  return (
    <>
      <div className="flex items-center justify-between pr-3 pl-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
        <span>Threads</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New thread"
          onClick={() => navigate({ to: "/threads" })}
        >
          <Plus />
        </Button>
      </div>
      <SidebarMenu className="px-2 group-data-[collapsible=icon]:hidden">
        {nestForks(threads).map(({ thread, nested }) => (
          <SidebarMenuItem key={thread.id}>
            <SidebarMenuButton
              render={<Link to="/threads/$threadId" params={{ threadId: thread.id }} />}
              isActive={pathname === `/threads/${thread.id}`}
              className={cn(nested && "pl-6")}
            >
              <SidebarProjectTile
                thread={thread}
                project={projects.find((candidate) => candidate.id === thread.projectId)}
                palette={palettes.get(thread.projectId)}
              />
              <SharedMark thread={thread} />
              <ForkBadge thread={thread} />
              <ThreadTitle
                thread={thread}
                hint={hostLabel(thread)}
                editing={editing === thread.id}
                onEdit={() => setEditing(thread.id)}
                onDone={(value) => {
                  setEditing(null);
                  if (value !== undefined) void rename(thread, value);
                }}
              />
            </SidebarMenuButton>
            <UpdatedAt thread={thread} yields />
            {/* Shown on hover or keyboard focus, not `showOnHover`: that also shows it while the
                row's link keeps focus after a click, over the time. */}
            <SidebarMenuAction
              className="right-2 peer-data-active/menu-button:text-sidebar-accent-foreground group-hover/menu-item:opacity-100 group-has-focus-visible/menu-item:opacity-100 md:opacity-0"
              aria-label={`Archive ${thread.title}`}
              title="Archive"
              onClick={() => void archive(thread)}
            >
              <Archive />
            </SidebarMenuAction>
          </SidebarMenuItem>
        ))}
        {threads.length === 0 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">Nothing here.</p>
        )}
      </SidebarMenu>
      {shared.length > 0 && (
        <>
          <div className="px-4 pt-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            Shared with workspace
          </div>
          <SidebarMenu className="px-2 group-data-[collapsible=icon]:hidden">
            {shared.map((thread) => (
              <SidebarMenuItem key={thread.id}>
                {/* No Archive here, so the room for the time is kept by hand. */}
                <SidebarMenuButton
                  render={<Link to="/threads/$threadId" params={{ threadId: thread.id }} />}
                  isActive={pathname === `/threads/${thread.id}`}
                  className="pr-8"
                >
                  <SidebarProjectTile
                    thread={thread}
                    project={projects.find((candidate) => candidate.id === thread.projectId)}
                    palette={palettes.get(thread.projectId)}
                  />
                  <SharedMark thread={thread} />
                  <span className="flex-1 truncate" title={`Shared by ${thread.createdByName}`}>
                    {thread.title}
                  </span>
                </SidebarMenuButton>
                <UpdatedAt thread={thread} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </>
      )}
    </>
  );
}
