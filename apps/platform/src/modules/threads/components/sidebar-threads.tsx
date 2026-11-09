import { Archive, GitBranch, Plus, Share, X } from "@mynaui/icons-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

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
import { useSplitPairs } from "../hooks/use-split-pairs";
import { useUnreadThreads } from "../hooks/use-unread-threads";
import { dragThread } from "../split";
import { crowdOf } from "../thread-crowd";
import type { SplitPair, Thread } from "../types";
import { ParticipantStack } from "./participant-stack";

const RUNNING_REFRESH_MS = 5000;

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

function UpdatedAt({ thread, yields = false }: { thread: Thread; yields?: boolean }) {
  return (
    <time
      dateTime={thread.updatedAt}
      title={timeAgo(thread.updatedAt, true)}
      className={cn(
        "pointer-events-none absolute inset-y-0 right-2 flex items-center justify-end text-xs whitespace-nowrap text-muted-foreground tabular-nums group-data-[collapsible=icon]:hidden",
        yields &&
          "group-hover/menu-item:opacity-0 group-has-focus-visible/menu-item:opacity-0 max-md:hidden",
      )}
    >
      {shortTimeAgo(thread.updatedAt)}
    </time>
  );
}

function UnreadDot() {
  return (
    <span
      role="img"
      aria-label="Finished, not opened yet"
      className="pointer-events-none absolute top-1/2 left-0 z-10 size-1.5 -translate-y-1/2 rounded-full bg-primary group-data-[collapsible=icon]:hidden"
    />
  );
}

function CrowdMark({ thread }: { thread: Thread }) {
  if (thread.visibility !== "workspace") return null;
  const crowd = crowdOf(thread);
  return crowd && <ParticipantStack crowd={crowd} />;
}

function SharedMark({ thread }: { thread: Thread }) {
  if (thread.visibility !== "workspace" || crowdOf(thread)) return null;
  return <Share role="img" aria-label="Shared with workspace" className="text-muted-foreground" />;
}

function ForkMark({ thread }: { thread: Thread }) {
  if (!thread.parentThreadId) return null;
  return <GitBranch role="img" aria-label="Fork" className="text-muted-foreground" />;
}

function ForkElbow({ first, last }: { first: boolean; last: boolean }) {
  const line =
    "pointer-events-none absolute left-[calc(1rem-0.5px)] group-data-[collapsible=icon]:hidden";
  return (
    <>
      <span
        aria-hidden
        data-slot="fork-elbow"
        className={cn(
          line,
          "bottom-1/2 w-3 rounded-bl-md border-b border-l border-muted-foreground/40",
          first ? "-top-2" : "top-0",
        )}
      />
      {!last && (
        <span
          aria-hidden
          className={cn(line, "top-1/2 bottom-0 border-l border-muted-foreground/40")}
        />
      )}
    </>
  );
}

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
  const shared = others.filter((thread) => thread.state === "open");
  const { runtimes } = useRuntimes();
  const { projects } = useProjects();
  const palettes = useProjectPalettes();
  const archive = useArchiveThread();
  const rename = useRenameThread();
  useFinishedSound();
  const unread = useUnreadThreads();
  const { pairs, partnerOf, unpair } = useSplitPairs();
  const [editing, setEditing] = useState<string | null>(null);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

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

  function row(
    thread: Thread,
    {
      nested = false,
      first = true,
      last = true,
    }: { nested?: boolean; first?: boolean; last?: boolean },
  ) {
    return (
      <SidebarMenuItem key={thread.id}>
        {nested && <ForkElbow first={first} last={last} />}
        {unread.has(thread.id) && <UnreadDot />}
        <SidebarMenuButton
          render={
            <Link
              to="/threads/$threadId"
              params={{ threadId: thread.id }}
              onDragStart={(event) => dragThread(event, thread.id)}
            />
          }
          isActive={pathname === `/threads/${thread.id}`}
          className={cn("pr-11", nested && "pl-8")}
        >
          <SidebarProjectTile
            thread={thread}
            project={projects.find((candidate) => candidate.id === thread.projectId)}
            palette={palettes.get(thread.projectId)}
          />
          <SharedMark thread={thread} />
          <ForkMark thread={thread} />
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
          <CrowdMark thread={thread} />
        </SidebarMenuButton>
        <UpdatedAt thread={thread} yields />
        <SidebarMenuAction
          className="right-2 peer-data-active/menu-button:text-sidebar-accent-foreground group-hover/menu-item:opacity-100 group-has-focus-visible/menu-item:opacity-100 md:opacity-0"
          aria-label={`Archive ${thread.title}`}
          title="Archive"
          onClick={() => void archive(thread)}
        >
          <Archive />
        </SidebarMenuAction>
      </SidebarMenuItem>
    );
  }

  function pairRow([left, right]: [Thread, Thread]) {
    const latest = left.updatedAt > right.updatedAt ? left : right;
    return (
      <SidebarMenuItem key={`pair-${left.id}-${right.id}`} data-slot="split-pair">
        {(unread.has(left.id) || unread.has(right.id)) && <UnreadDot />}
        <SidebarMenuButton
          render={
            <Link
              to="/threads/$threadId"
              params={{ threadId: left.id }}
              search={{ split: right.id }}
              title={`${left.title} + ${right.title}`}
            />
          }
          isActive={pathname === `/threads/${left.id}` || pathname === `/threads/${right.id}`}
          className="pr-11"
        >
          <span className="flex shrink-0 -space-x-1.5">
            {[left, right].map((thread) => (
              <SidebarProjectTile
                key={thread.id}
                thread={thread}
                project={projects.find((candidate) => candidate.id === thread.projectId)}
                palette={palettes.get(thread.projectId)}
              />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {left.title} + {right.title}
          </span>
        </SidebarMenuButton>
        <UpdatedAt thread={latest} yields />
        <SidebarMenuAction
          className="right-2 peer-data-active/menu-button:text-sidebar-accent-foreground group-hover/menu-item:opacity-100 group-has-focus-visible/menu-item:opacity-100 md:opacity-0"
          aria-label={`Unpair ${left.title} and ${right.title}`}
          title="Unpair"
          onClick={() => unpair(left.id)}
        >
          <X />
        </SidebarMenuAction>
      </SidebarMenuItem>
    );
  }

  function pairedWith(id: string) {
    const partner = threads.find((thread) => thread.id === partnerOf(id));
    return partner && partner.id !== id ? partner : undefined;
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
        {nestForks(threads).map(({ thread, nested }, index, rows) => {
          const partner = pairedWith(thread.id);
          if (partner) {
            const first =
              rows.findIndex((row) => row.thread.id === thread.id) <
              rows.findIndex((row) => row.thread.id === partner.id);
            if (!first) return null;
            const pair: SplitPair = pairs.find((each) => each[0] === partner.id)
              ? [partner.id, thread.id]
              : [thread.id, partner.id];
            return pairRow(pair[0] === thread.id ? [thread, partner] : [partner, thread]);
          }
          return row(thread, {
            nested,
            first: !rows[index - 1]?.nested,
            last: !rows[index + 1]?.nested,
          });
        })}
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
                <SidebarMenuButton
                  render={
                    <Link
                      to="/threads/$threadId"
                      params={{ threadId: thread.id }}
                      onDragStart={(event) => dragThread(event, thread.id)}
                    />
                  }
                  isActive={pathname === `/threads/${thread.id}`}
                  className="pr-11"
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
                  <CrowdMark thread={thread} />
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
