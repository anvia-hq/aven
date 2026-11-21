import {
  IconChevronsDown,
  IconChevronsUp,
  IconColumns2,
  IconGitBranch,
  IconGitCompare,
  IconRefresh,
} from "@tabler/icons-react";
import { cn } from "cn";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@aven/ui/button";
import { PanelNotice } from "@aven/ui/panel-notice";
import { SidePanel } from "@aven/ui/side-panel";
import { Skeleton } from "@aven/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@aven/ui/tabs";

import { useDiffPreferences } from "../hooks/use-diff-preferences";
import { useThreadDiff } from "../hooks/use-thread-diff";
import { isDiffLayout, isDiffScope, type DiffScope } from "../types";
import { flatten, startsOpen } from "../flatten";
import { DiffFilePicker } from "./diff-file-picker";
import { DiffVirtualList } from "./diff-virtual-list";

type Props = {
  threadId: string;
  running: boolean;
  onClose: () => void;
};

const EMPTY: Record<DiffScope, string> = {
  turn: "The last turn changed no files.",
  unshipped: "Everything the branch changed is shipped.",
  all: "This thread has not changed any files yet.",
};

export function DiffPanel({ threadId, running, onClose }: Props) {
  const { scope, setScope, layout, setLayout } = useDiffPreferences();
  const {
    loaded,
    problem,
    refreshing,
    available,
    truncated,
    branch,
    files,
    additions,
    deletions,
    refresh,
  } = useThreadDiff(threadId, scope, running);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [scrollTo, setScrollTo] = useState<{ path: string; seq: number } | null>(null);

  useEffect(() => {
    setOpened({});
    setScrollTo(null);
  }, [threadId]);

  const items = useMemo(() => flatten(files, layout, opened), [files, layout, opened]);
  const anyOpen = useMemo(
    () => files.some((file) => opened[file.path] ?? startsOpen(file)),
    [files, opened],
  );

  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    for (const file of files) next[file.path] = !anyOpen;
    setOpened(next);
  };

  const jumpToFile = (path: string) => {
    setOpened((now) => (now[path] === true ? now : { ...now, [path]: true }));
    setScrollTo((prev) => ({ path, seq: (prev?.seq ?? 0) + 1 }));
  };

  return (
    <SidePanel
      title="Changes"
      icon={IconGitCompare}
      onClose={onClose}
      actions={
        <>
          <div className="min-w-0 flex-1">
            {files.length > 0 && (
              <DiffFilePicker
                files={files}
                additions={additions}
                deletions={deletions}
                onSelect={jumpToFile}
              />
            )}
          </div>
          {files.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={anyOpen ? "Collapse all files" : "Expand all files"}
              title={anyOpen ? "Collapse all files" : "Expand all files"}
              onClick={toggleAll}
            >
              {anyOpen ? <IconChevronsUp /> : <IconChevronsDown />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh changes"
            title="Refresh changes"
            onClick={refresh}
          >
            <IconRefresh className={cn(refreshing && "animate-spin")} />
          </Button>
          <Tabs value={layout} onValueChange={(next) => isDiffLayout(next) && setLayout(next)}>
            <TabsList aria-label="Layout">
              <TabsTrigger value="unified" aria-label="Unified">
                <IconColumns2 className="rotate-90" />
              </TabsTrigger>
              <TabsTrigger value="split" aria-label="Split">
                <IconColumns2 />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
        <Tabs value={scope} onValueChange={(next) => isDiffScope(next) && setScope(next)}>
          <TabsList>
            <TabsTrigger value="turn">Last turn</TabsTrigger>
            <TabsTrigger value="unshipped">Unshipped</TabsTrigger>
            <TabsTrigger value="all">Full diff</TabsTrigger>
          </TabsList>
        </Tabs>
        {branch && (
          <span
            className="flex min-w-0 items-center gap-1 truncate font-mono text-xs text-muted-foreground"
            title={branch}
          >
            <IconGitBranch className="size-3.5 shrink-0" />
            <span className="truncate">{branch}</span>
          </span>
        )}
      </div>
      {files.length > 0 ? (
        <DiffVirtualList
          items={items}
          scrollTo={scrollTo}
          onToggle={(file, open) => setOpened((now) => ({ ...now, [file.path]: open }))}
          footer={
            truncated
              ? "The diff is too large to show in full; the end of it is left out."
              : undefined
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!loaded && <Skeleton className="size-full rounded-none" />}
          {problem && <PanelNotice>{problem}</PanelNotice>}
          {loaded && !problem && available === false && (
            <PanelNotice>
              This thread has no workspace yet. It is made when the agent first works on the thread.
            </PanelNotice>
          )}
          {loaded && available && <PanelNotice>{EMPTY[scope]}</PanelNotice>}
        </div>
      )}
    </SidePanel>
  );
}
