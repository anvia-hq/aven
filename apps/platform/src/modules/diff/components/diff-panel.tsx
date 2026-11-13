import { Columns, GitDiff, Menu } from "@mynaui/icons-react";
import { useMemo, useState } from "react";

import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { Skeleton } from "@aven/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@aven/ui/tabs";

import { useDiffPreferences } from "../hooks/use-diff-preferences";
import { useThreadDiff } from "../hooks/use-thread-diff";
import { isDiffLayout, isDiffScope, type DiffScope } from "../types";
import { flatten } from "../flatten";
import { DiffVirtualList } from "./diff-virtual-list";
import { DiffStat } from "./diff-stat";

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
  const { loaded, problem, available, truncated, files, additions, deletions } = useThreadDiff(
    threadId,
    scope,
    running,
  );
  const counted = additions > 0 || deletions > 0;
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const items = useMemo(() => flatten(files, layout, opened), [files, layout, opened]);

  return (
    <SidePanel
      title="Changes"
      icon={GitDiff}
      onClose={onClose}
      actions={
        <>
          {files.length > 0 && (
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {files.length} {files.length === 1 ? "file" : "files"}{" "}
              {counted && <DiffStat additions={additions} deletions={deletions} />}
            </p>
          )}
          {files.length === 0 && <span className="flex-1" />}
          <Tabs value={layout} onValueChange={(next) => isDiffLayout(next) && setLayout(next)}>
            <TabsList aria-label="Layout">
              <TabsTrigger value="unified" aria-label="Unified">
                <Menu />
              </TabsTrigger>
              <TabsTrigger value="split" aria-label="Split">
                <Columns />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      }
    >
      <div className="shrink-0 border-b px-4 py-2">
        <Tabs value={scope} onValueChange={(next) => isDiffScope(next) && setScope(next)}>
          <TabsList>
            <TabsTrigger value="turn">Last turn</TabsTrigger>
            <TabsTrigger value="unshipped">Unshipped</TabsTrigger>
            <TabsTrigger value="all">Full diff</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {files.length > 0 ? (
        <DiffVirtualList
          items={items}
          files={files}
          layout={layout}
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
