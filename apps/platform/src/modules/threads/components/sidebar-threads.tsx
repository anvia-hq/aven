import { IconGitBranch, IconShare } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { useMemo, useState } from "react";

import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@aven/ui/sidebar";
import { dragThread } from "@/lib/thread-drag";
import { ComputerTile } from "@/modules/computer/components/computer-tile";
import { ProjectTile } from "@/modules/projects/components/project-tile";
import { markColors } from "@/modules/projects/orb-art";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";
import { isSandbox } from "@/modules/runtimes/sandbox";
import type { Runtime } from "@/modules/runtimes/types";

import { useArchiveThread } from "../hooks/use-archive-thread";
import { useFinishedSound } from "../hooks/use-finished-sound";
import { useMentionedThreads } from "../hooks/use-mentioned-threads";
import { usePinThread } from "../hooks/use-pin-thread";
import { useRenameThread } from "../hooks/use-rename-thread";
import { useRestoreThread } from "../hooks/use-restore-thread";
import { useSplitPairs } from "../hooks/use-split-pairs";
import { useThreads } from "../hooks/use-threads";
import { useUnreadThreads } from "../hooks/use-unread-threads";
import { splitPinned, withoutPinned } from "../pinned-threads";
import { recencyGroups } from "../recency-groups";
import { buildSidebarRows } from "../sidebar-rows";
import { crowdOf } from "../thread-crowd";
import { statusOfPair, threadStatus } from "../thread-status";
import type { Thread, ThreadStatus } from "../types";
import { ParticipantStack } from "./participant-stack";
import { SidebarSection } from "./sidebar-section";
import { ThreadActionsMenu } from "./thread-actions-menu";
import { ThreadTitleField } from "./thread-title-field";

const ROW =
  "hover:bg-sidebar-accent/50 data-active:bg-sidebar-accent data-active:font-medium data-active:hover:bg-sidebar-accent";

function SidebarThreadMark({ thread, runtime }: { thread: Thread; runtime?: Runtime }) {
  const Tile = !runtime || isSandbox(runtime) ? ProjectTile : ComputerTile;

  return (
    <Tile
      projectId={thread.projectId}
      colors={thread.markColor ? markColors(thread.markColor) : undefined}
      working={thread.running}
      className="-mx-0.5 size-5"
    />
  );
}

function StatusDot({
  status,
  question = false,
}: {
  status: ThreadStatus | null;
  question?: boolean;
}) {
  if (!status) return null;

  if (question)
    return (
      <span className="shrink-0 rounded-full bg-graph-4/45 px-2 py-0.5 text-[11px] leading-4 font-medium text-foreground">
        Needs answer
      </span>
    );

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
    <IconShare role="img" aria-label="Shared with workspace" className="text-muted-foreground" />
  );
}

function ForkMark({ thread }: { thread: Thread }) {
  if (!thread.parentThreadId) return null;

  return <IconGitBranch role="img" aria-label="Fork" className="text-muted-foreground" />;
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
  const { threads: own, shared: others } = useThreads();
  const threads = own.filter((thread) => thread.state === "open");
  const archived = own.filter((thread) => thread.state === "archived");
  const shared = others.filter((thread) => thread.state === "open");
  const { computers: runtimes } = useRuntimes({ poll: true });
  const archive = useArchiveThread();
  const restore = useRestoreThread();
  const rename = useRenameThread();
  const pin = usePinThread();
  useFinishedSound();
  const unread = useUnreadThreads();
  const mentioned = useMentionedThreads();
  const { pairs, partnerOf } = useSplitPairs();
  const [editing, setEditing] = useState<string | null>(null);
  const { pinned, pinnedIds } = splitPinned(threads);
  const groups = withoutPinned(recencyGroups(threads), pinnedIds);
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const runtimesById = useMemo(
    () => new Map(runtimes.map((runtime) => [runtime.id, runtime])),
    [runtimes],
  );

  function hostLabel(thread: Thread) {
    const host = runtimesById.get(thread.runtimeId)?.name ?? "a runner";
    return `${thread.running ? "Running" : "Hosted"} on ${host}`;
  }

  function row(
    thread: Thread,
    {
      nested = false,
      first = true,
      last = true,
      archived = false,
    }: { nested?: boolean; first?: boolean; last?: boolean; archived?: boolean },
  ) {
    return (
      <SidebarMenuItem key={thread.id}>
        {nested && <ForkElbow first={first} last={last} />}
        <SidebarMenuButton
          render={
            <Link
              to="/threads/$threadId"
              params={{ threadId: thread.id }}
              onDragStart={archived ? undefined : (event) => dragThread(event, thread.id)}
            />
          }
          isActive={pathname === `/threads/${thread.id}`}
          className={cn(ROW, nested && "pl-8")}
        >
          <SidebarThreadMark thread={thread} runtime={runtimesById.get(thread.runtimeId)} />
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
          {!archived && (
            <StatusDot
              status={threadStatus(thread, { mentioned, unread })}
              question={thread.awaitingAnswer}
            />
          )}
        </SidebarMenuButton>
        <ThreadActionsMenu
          title={thread.title}
          pinned={thread.pinnedAt !== null}
          onTogglePin={archived ? undefined : () => void pin(thread)}
          onArchive={archived ? undefined : () => void archive(thread)}
          onRestore={archived ? () => void restore(thread) : undefined}
        />
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
          className={ROW}
        >
          <span className="flex shrink-0 items-center gap-0.5">
            {[left, right].map((thread) => (
              <SidebarThreadMark
                key={thread.id}
                thread={thread}
                runtime={runtimesById.get(thread.runtimeId)}
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
            question={left.awaitingAnswer || right.awaitingAnswer}
          />
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  function rows(list: Thread[]) {
    return buildSidebarRows(list, pairs, partnerOf).map((entry) =>
      entry.kind === "pair"
        ? pairRow(entry.pair)
        : row(entry.thread, { nested: entry.nested, first: entry.first, last: entry.last }),
    );
  }

  return (
    <>
      <div className="px-2 pt-4 group-data-[collapsible=icon]:hidden">
        {pinned.length > 0 && (
          <SidebarSection id="pinned" label="Pinned">
            <SidebarMenu>{rows(pinned)}</SidebarMenu>
          </SidebarSection>
        )}
        {groups.map((group) => (
          <SidebarSection key={group.id} id={group.id} label={group.label}>
            <SidebarMenu>{rows(group.threads)}</SidebarMenu>
          </SidebarSection>
        ))}
        {archived.length > 0 && (
          <SidebarSection
            id="archived"
            label={`Archived (${archived.length})`}
            collapsible
            defaultOpen={false}
            lazy
          >
            <SidebarMenu>{archived.map((thread) => row(thread, { archived: true }))}</SidebarMenu>
          </SidebarSection>
        )}
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
                  className={ROW}
                >
                  <SidebarThreadMark thread={thread} runtime={runtimesById.get(thread.runtimeId)} />
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
