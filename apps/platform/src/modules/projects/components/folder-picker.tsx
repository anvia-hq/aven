import { ArrowUp, Folder, FolderPlus, GitBranch } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Input } from "@aven/ui/input";
import { PanelNotice } from "@/components/panel-notice";
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
    <div className="flex flex-col" aria-busy="true">
      {skeletonWidths.map((width) => (
        <div key={width} className="flex h-9 items-center gap-2 px-3">
          <Skeleton className="size-4" />
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
      <ul className="flex flex-col">
        {shown.folders.map((folder) => (
          <li key={folder.path}>
            <Button
              type="button"
              variant="ghost"
              aria-pressed={folder.path === path}
              className="h-9 w-full justify-start gap-2 rounded-none px-3 font-normal select-none aria-pressed:bg-primary/15 aria-pressed:shadow-[inset_2px_0_0_var(--color-primary)]"
              onClick={() => onChange(folder.path)}
              onDoubleClick={() => openFolder(folder.path)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;

                event.preventDefault();
                openFolder(folder.path);
              }}
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{folder.name}</span>
              {folder.git && <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Up one folder"
          disabled={!browsing}
          onClick={() => openFolder(shown?.parent ?? "")}
        >
          <ArrowUp />
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={browsing}>
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
          <FolderPlus />
        </Button>
      </div>
      {naming && (
        <div className="flex items-center gap-2">
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
        </div>
      )}
      <div className="h-56 overflow-y-auto rounded-md border">{body}</div>
    </div>
  );
}
