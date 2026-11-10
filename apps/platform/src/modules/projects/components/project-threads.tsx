import { Plus } from "@mynaui/icons-react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { buttonVariants } from "@/components/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { ThreadList } from "@/modules/threads/components/thread-list";
import type { Thread } from "@/modules/threads/types";

type ThreadTab = "open" | "archived";

type Props = {
  threads: Thread[];
  projectCount: number;
};

const newestFirst = (threads: Thread[]) =>
  [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

function emptyText(tab: ThreadTab) {
  if (tab === "archived") return "No archived threads.";
  return "No open threads yet. Start one with New thread.";
}

export function ProjectThreads({ threads, projectCount }: Props) {
  const [tab, setTab] = useState<ThreadTab>("open");
  const open = threads.filter((thread) => thread.state !== "archived");
  const archived = threads.filter((thread) => thread.state === "archived");
  const shown = newestFirst(tab === "archived" ? archived : open);

  return (
    <section aria-label="Thread list" className="flex min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-2 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-sm font-medium">All threads</h2>
          <p className="truncate text-xs text-muted-foreground">
            {`${open.length} open in ${projectCount} ${projectCount === 1 ? "project" : "projects"}`}
          </p>
        </div>
        <Link to="/threads" className={buttonVariants({ size: "sm" })}>
          <Plus />
          New thread
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(next) => setTab(next as ThreadTab)} className="shrink-0">
        <TabsList
          variant="line"
          aria-label="Thread state"
          className="h-8 w-full justify-start gap-1 border-b px-0"
        >
          <TabsTrigger value="open" className="flex-none gap-1 px-2 text-xs">
            Open
            <span className="text-xs text-muted-foreground tabular-nums">{open.length}</span>
          </TabsTrigger>
          <TabsTrigger value="archived" className="flex-none gap-1 px-2 text-xs">
            Archived
            <span className="text-xs text-muted-foreground tabular-nums">{archived.length}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-y-auto pt-1">
        <ThreadList threads={shown} showProject compact empty={emptyText(tab)} />
      </div>
    </section>
  );
}
