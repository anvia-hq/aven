import { Folder, Refresh, Search, Sidebar } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { SidePanel } from "@/components/side-panel";

import { useExplorerState } from "../hooks/use-explorer-state";
import { useWorkspaceTree } from "../hooks/use-workspace-tree";
import { FileMatches } from "./file-matches";
import { FileTree } from "./file-tree";
import { FileTabs } from "./file-tabs";
import { FileViewer } from "./file-viewer";

type Props = {
  threadId: string;
  /** Whether the agent is working: the files are followed while it is. */
  running: boolean;
  onClose: () => void;
};

// The files of the thread's workspace beside the conversation: a file to read, in tabs, and the
// tree of the workspace beside it. Which folders and files are open is kept per thread.
export function FilesPanel({ threadId, running, onClose }: Props) {
  const explorer = useExplorerState(threadId);
  const { folders, available, problem, refresh } = useWorkspaceTree(
    threadId,
    explorer.expanded,
    running,
  );
  const [query, setQuery] = useState("");

  return (
    <SidePanel
      title="Files"
      icon={Folder}
      onClose={onClose}
      actions={
        <>
          <FileTabs
            open={explorer.open}
            active={explorer.active}
            onSelect={explorer.select}
            onClose={explorer.closeFile}
          />
          {explorer.open.length === 0 && <span className="flex-1" />}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reload files"
            onClick={() => void refresh()}
          >
            <Refresh />
          </Button>
          <Button
            variant={explorer.treeShown ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="File tree"
            aria-pressed={explorer.treeShown}
            onClick={explorer.toggleTree}
          >
            <Sidebar />
          </Button>
        </>
      }
    >
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <FileViewer threadId={threadId} path={explorer.active} running={running} />
        </div>
        {explorer.treeShown && (
          <aside className="flex w-56 shrink-0 flex-col gap-2 border-l p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 pl-7 text-xs md:text-xs"
                placeholder="Filter files"
                aria-label="Filter files"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {problem && <p className="px-3 py-2 text-xs text-muted-foreground">{problem}</p>}
              {!problem && available === false && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  This thread has no workspace yet. It is made when the agent first works on it.
                </p>
              )}
              {available &&
                (query.trim() === "" ? (
                  <FileTree
                    folders={folders}
                    expanded={explorer.expanded}
                    active={explorer.active}
                    onToggleFolder={explorer.toggleFolder}
                    onOpenFile={explorer.openFile}
                  />
                ) : (
                  <FileMatches
                    folders={folders}
                    query={query}
                    active={explorer.active}
                    onOpenFile={explorer.openFile}
                  />
                ))}
            </div>
          </aside>
        )}
      </div>
    </SidePanel>
  );
}
