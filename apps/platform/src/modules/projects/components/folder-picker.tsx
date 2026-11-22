import {
  IconArrowUp,
  IconChevronRight,
  IconFolder,
  IconFolderFilled,
  IconFolderPlus,
  IconGitBranch,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";
import { PanelNotice } from "@aven/ui/panel-notice";
import { Skeleton } from "@aven/ui/skeleton";

import { useFolderBrowser } from "../hooks/use-folder-browser";

const skeletonWidths = ["40%", "55%", "32%", "48%", "60%"];

type Props = {
  runtimeId: string;
  path: string;
  onChange: (path: string) => void;
};

export function FolderPicker({ runtimeId, path, onChange }: Props) {
  const [browsing, setBrowsing] = useState("");
  const { listing, creating, createFolder } = useFolderBrowser(runtimeId, browsing, openFolder);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  function openFolder(next: string) {
    setBrowsing(next);
    onChange(next);
  }

  async function submitName() {
    if (await createFolder(name)) {
      setNaming(false);
      setName("");
    }
  }

  const shown = listing?.data ?? null;
  let body = (
    <div className="flex flex-col p-1" aria-busy="true">
      {skeletonWidths.map((width) => (
        <div key={width} className="flex h-9 items-center gap-2.5 px-2.5">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3" style={{ width }} />
        </div>
      ))}
    </div>
  );

  if (listing?.error) body = <PanelNotice>{listing.error}</PanelNotice>;
  else if (shown && shown.folders.length === 0) {
    body = <PanelNotice>No folders in here. Add this one, or make a new one.</PanelNotice>;
  } else if (shown) {
    body = (
      <ul className="flex flex-col gap-0.5 p-1">
        {shown.folders.map((folder) => {
          const selected = folder.path === path;

          return (
            <li key={folder.path}>
              <Button
                type="button"
                variant="ghost"
                aria-pressed={selected}
                className="group h-9 w-full justify-start gap-2.5 rounded-lg px-2.5 text-left font-normal select-none aria-pressed:bg-accent/80 aria-pressed:font-medium aria-pressed:text-foreground"
                onClick={() => onChange(folder.path)}
                onDoubleClick={() => openFolder(folder.path)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;

                  event.preventDefault();
                  openFolder(folder.path);
                }}
              >
                {selected ? (
                  <IconFolderFilled className="size-4 shrink-0 text-foreground" />
                ) : (
                  <IconFolder className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
                {folder.git && (
                  <span
                    aria-hidden
                    className="inline-flex items-center gap-1 rounded-md bg-muted/80 px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground"
                  >
                    <IconGitBranch className="size-3" />
                    git
                  </span>
                )}
                <IconChevronRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground/35 transition-colors group-hover:text-muted-foreground"
                />
              </Button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 text-sm">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background/40">
        <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/25 px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Up one folder"
            disabled={!browsing}
            onClick={() => openFolder(shown?.parent ?? "")}
          >
            <IconArrowUp />
          </Button>
          <span
            className={
              browsing
                ? "min-w-0 flex-1 truncate text-left font-mono text-xs text-foreground"
                : "min-w-0 flex-1 truncate text-left text-xs text-muted-foreground"
            }
            title={browsing}
          >
            {browsing || "Folders this computer serves"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="New folder"
            disabled={!browsing}
            onClick={() => setNaming(true)}
          >
            <IconFolderPlus />
          </Button>
        </div>
        {naming && (
          <div className="flex items-center gap-1.5 border-b bg-muted/20 px-2.5 py-2">
            <Input
              aria-label="Name of the new folder"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void submitName();
                }

                if (event.key === "Escape") setNaming(false);
              }}
              placeholder="New folder name"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={creating || !name.trim()}
              onClick={() => void submitName()}
            >
              Create
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Cancel new folder"
              onClick={() => {
                setNaming(false);
                setName("");
              }}
            >
              <IconX />
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </div>
      <span className="text-xs text-muted-foreground">
        Click to select a folder, or double-click to open it.
      </span>
    </div>
  );
}
