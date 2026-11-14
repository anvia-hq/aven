import { GitBranch, Share } from "@mynaui/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

import { Input } from "@aven/ui/input";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@aven/ui/sidebar";
import { THREAD_TITLE_MAX } from "@aven/protocol/threads";
import { dragThread } from "@/lib/thread-drag";
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
import { useMentionedThreads } from "../hooks/use-mentioned-threads";
import { useUnreadThreads } from "../hooks/use-unread-threads";
import { recencyGroups } from "../recency-groups";
import { crowdOf } from "../thread-crowd";
import type { Thread } from "../types";
import { ParticipantStack } from "./participant-stack";
import { RecencyGroupSection } from "./recency-group-section";
import { ThreadActionsMenu } from "./thread-actions-menu";

const RUNNING_REFRESH_MS = 5000;

function SidebarProjectTile({
  thread,
  project,
  palette,
  machine,
}: {
  thread: Thread;
  project?: Project;
  palette?: number;
  machine?: { name: string; online: boolean };
}) {
  if (!project) return <span className="-mx-0.5 size-5 shrink-0" aria-hidden />;

  return (
    <span className="relative -mx-0.5 shrink-0">
      <ProjectTile projectId={project.id} palette={palette} working={thread.running} />
      {machine && (
        <span
          role="img"
          aria-label={`On ${machine.name}, ${machine.online ? "online" : "offline"}`}
          className={cn(
            "absolute right-0 bottom-0 size-1.5 rounded-full ring-1 ring-sidebar",
            machine.online ? "bg-success" : "bg-muted-foreground",
          )}
        />
      )}
    </span>
  );
}

function UnreadDot({ label = "Finished, not opened yet" }: { label?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
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
      maxLength={THREAD_TITLE_MAX}
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
  const { threads: own, shared: others, refresh } = useThreads();
  const threads = own.filter((thread) => thread.state === "open");
  const shared = others.filter((thread) => thread.state === "open");
  const { runtimes } = useRuntimes({ poll: true });
  const { projects } = useProjects();
  const palettes = useProjectPalettes();
  const archive = useArchiveThread();
  const rename = useRenameThread();
  useFinishedSound();
  const unread = useUnreadThreads();
  const mentioned = useMentionedThreads();
  const { pairs, partnerOf } = useSplitPairs();
  const [editing, setEditing] = useState<string | null>(null);
  const groups = recencyGroups(threads);
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

  function machineOf(thread: Thread) {
    const runtime = runtimes.find((candidate) => candidate.id === thread.runtimeId);
    return runtime?.ownerId ? { name: runtime.name, online: runtime.online } : undefined;
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
        {mentioned.has(thread.id) ? (
          <UnreadDot label="You were mentioned, not opened yet" />
        ) : (
          unread.has(thread.id) && <UnreadDot />
        )}
        <SidebarMenuButton
          render={
            <Link
              to="/threads/$threadId"
              params={{ threadId: thread.id }}
              onDragStart={(event) => dragThread(event, thread.id)}
            />
          }
          isActive={pathname === `/threads/${thread.id}`}
          className={cn(nested && "pl-8")}
        >
          <SidebarProjectTile
            thread={thread}
            project={projects.find((candidate) => candidate.id === thread.projectId)}
            palette={palettes.get(thread.projectId)}
            machine={machineOf(thread)}
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
        <ThreadActionsMenu title={thread.title} onArchive={() => void archive(thread)} />
      </SidebarMenuItem>
    );
  }

  function pairRow([left, right]: [Thread, Thread]) {
    return (
      <SidebarMenuItem key={`pair-${left.id}-${right.id}`} data-slot="split-pair">
        {mentioned.has(left.id) || mentioned.has(right.id) ? (
          <UnreadDot label="You were mentioned, not opened yet" />
        ) : (
          (unread.has(left.id) || unread.has(right.id)) && <UnreadDot />
        )}
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
      </SidebarMenuItem>
    );
  }

  function pairedWith(id: string, list: Thread[]) {
    const partner = list.find((thread) => thread.id === partnerOf(id));
    return partner && partner.id !== id ? partner : undefined;
  }

  function rows(list: Thread[]) {
    return nestForks(list).map(({ thread, nested }, index, all) => {
      const partner = pairedWith(thread.id, list);

      if (partner) {
        const first =
          all.findIndex((each) => each.thread.id === thread.id) <
          all.findIndex((each) => each.thread.id === partner.id);

        if (!first) return null;

        const ordered: [Thread, Thread] = pairs.some(([left]) => left === partner.id)
          ? [partner, thread]
          : [thread, partner];
        return pairRow(ordered);
      }

      const joins = (at: number) => {
        const neighbour = all[at];
        return neighbour?.nested === true && !pairedWith(neighbour.thread.id, list);
      };
      return row(thread, { nested, first: !joins(index - 1), last: !joins(index + 1) });
    });
  }

  return (
    <>
      <div className="px-2 pt-4 group-data-[collapsible=icon]:hidden">
        {groups.map((group) => (
          <RecencyGroupSection key={group.id} group={group}>
            <SidebarMenu>{rows(group.threads)}</SidebarMenu>
          </RecencyGroupSection>
        ))}
      </div>
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
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </>
      )}
    </>
  );
}
