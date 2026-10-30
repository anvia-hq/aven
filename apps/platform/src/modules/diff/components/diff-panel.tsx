import { Columns, GitDiff, Menu } from "@mynaui/icons-react";

import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { Skeleton } from "@/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";

import { useDiffPreferences } from "../hooks/use-diff-preferences";
import { useThreadDiff } from "../hooks/use-thread-diff";
import { isDiffLayout, isDiffScope, type DiffScope } from "../types";
import { DiffFileCard } from "./diff-file-card";
import { DiffStat } from "./diff-stat";

type Props = {
  threadId: string;
  /** Whether the agent is working: the changes are followed while it is. */
  running: boolean;
  onClose: () => void;
};

const EMPTY: Record<DiffScope, string> = {
  turn: "The last turn changed no files.",
  all: "This thread has not changed any files yet.",
};

// What the thread has changed in its workspace, beside the conversation: the last turn's changes or
// everything since the branch left the default branch, drawn as one column or two.
export function DiffPanel({ threadId, running, onClose }: Props) {
  const { scope, setScope, layout, setLayout } = useDiffPreferences();
  const { loaded, problem, available, truncated, files } = useThreadDiff(threadId, scope, running);
  const additions = files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = files.reduce((sum, file) => sum + file.deletions, 0);

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
              <DiffStat additions={additions} deletions={deletions} />
            </p>
          )}
          {files.length === 0 && <span className="flex-1" />}
          <ToggleGroup
            value={[layout]}
            onValueChange={(next) => isDiffLayout(next[0]) && setLayout(next[0])}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Layout"
          >
            <ToggleGroupItem value="unified" aria-label="Unified">
              <Menu />
            </ToggleGroupItem>
            <ToggleGroupItem value="split" aria-label="Split">
              <Columns />
            </ToggleGroupItem>
          </ToggleGroup>
        </>
      }
    >
      <div className="shrink-0 border-b px-4 py-2">
        <Tabs value={scope} onValueChange={(next) => isDiffScope(next) && setScope(next)}>
          <TabsList>
            <TabsTrigger value="turn">Last turn</TabsTrigger>
            <TabsTrigger value="all">Full diff</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!loaded && <Skeleton className="size-full rounded-none" />}
        {problem && <PanelNotice>{problem}</PanelNotice>}
        {loaded && !problem && available === false && (
          <PanelNotice>
            This thread has no workspace yet. It is made when the agent first works on the thread.
          </PanelNotice>
        )}
        {loaded && available && files.length === 0 && <PanelNotice>{EMPTY[scope]}</PanelNotice>}
        {files.length > 0 && (
          <div className="flex flex-col gap-3 p-4">
            {files.map((file) => (
              <DiffFileCard key={file.path} file={file} layout={layout} />
            ))}
            {truncated && (
              <p className="text-center text-xs text-muted-foreground">
                The diff is too large to show in full; the end of it is left out.
              </p>
            )}
          </div>
        )}
      </div>
    </SidePanel>
  );
}
