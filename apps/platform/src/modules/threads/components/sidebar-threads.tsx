import { GitBranchIcon, ShareIcon } from "@solar-icons/react/linear";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { useEffect, useState } from "react";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@aven/ui/sidebar";
import { dragThread } from "@/lib/thread-drag";
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
import { statusOfPair, threadStatus } from "../thread-status";
import type { Thread, ThreadStatus } from "../types";
import { ParticipantStack } from "./participant-stack";
import { RecencyGroupSection } from "./recency-group-section";
import { ThreadActionsMenu } from "./thread-actions-menu";
import { ThreadMark } from "./thread-mark";
import { ThreadTitleField } from "./thread-title-field";

const RUNNING_REFRESH_MS = 5000;

function SidebarThreadMark({
  thread,
  project,
  palette,
}: {
  thread: Thread;
  project?: Project;
  palette?: number;
}) {
  if (!project) return <span className="-mx-0.5 size-5 shrink-0" aria-hidden />;

  return (
    <span className="relative -mx-0.5 shrink-0">
      <ThreadMark
        projectId={project.id}
        runtimeId={thread.runtimeId}
        palette={palette}
        color={thread.markColor}
        working={thread.running}
      />
    </span>
  );
}

function StatusDot({ status }: { status: ThreadStatus | null }) {
  if (!status) return null;

  return (
    <span
      role="img"
      aria-label={status === "attention" ? "Needs your attention" : "Finished, not opened yet"}
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "attention" ? "bg-destructive" : "bg-info",
      )}
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

  return (
    <ShareIcon role="img" aria-label="Shared with workspace" className="text-muted-foreground" />
  );
}

function ForkMark({ thread }: { thread: Thread }) {
  if (!thread.parentThreadId) return null;

  return <GitBranchIcon role="img" aria-label="Fork" className="text-muted-foreground" />;
}

const ELBOW_RADIUS = "0.375rem";
const ELBOW_COLOR = "border-[color-mix(in_oklch,var(--muted-foreground)_40%,var(--sidebar))]";

function ForkElbow({ first, last }: { first: boolean; last: boolean }) {
  const line =
    "pointer-events-none absolute left-[calc(1rem-0.5px)] group-data-[collapsible=icon]:hidden";
  return (
    <>
      <span
        aria-hidden
        data-slot="fork-elbow"
        style={{ borderBottomLeftRadius: ELBOW_RADIUS }}
        className={cn(
          line,
          "bottom-1/2 w-3 border-b border-l",
          ELBOW_COLOR,
          first ? "-top-2" : "top-0",
        )}
      />
      {!last && (
        <span
          aria-hidden
          style={{ top: `calc(50% - ${ELBOW_RADIUS})` }}
          className={cn(line, "bottom-0 border-l", ELBOW_COLOR)}
        />
      )}
    </>
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
  if (editing) return <ThreadTitleField title={thread.title} onDone={onDone} />;

  return (
    <span
      className="flex-1 truncate"
      title={hint}
      style={thread.markColor ? { color: thread.markColor } : undefined}
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
  const { computers: runtimes } = useRuntimes({ poll: true });
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
          <SidebarThreadMark
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
          <StatusDot status={threadStatus(thread, { mentioned, unread })} />
        </SidebarMenuButton>
        <ThreadActionsMenu title={thread.title} onArchive={() => void archive(thread)} />
      </SidebarMenuItem>
    );
  }

  function pairRow([left, right]: [Thread, Thread]) {
    return (
      <SidebarMenuItem key={`pair-${left.id}-${right.id}`} data-slot="split-pair">
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
              <SidebarThreadMark
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
          <StatusDot
            status={statusOfPair(
              threadStatus(left, { mentioned, unread }),
              threadStatus(right, { mentioned, unread }),
            )}
          />
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
                  <SidebarThreadMark
                    thread={thread}
                    project={projects.find((candidate) => candidate.id === thread.projectId)}
                    palette={palettes.get(thread.projectId)}
                  />
                  <SharedMark thread={thread} />
                  <span
                    className="flex-1 truncate"
                    title={`Shared by ${thread.createdByName}`}
                    style={thread.markColor ? { color: thread.markColor } : undefined}
                  >
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
