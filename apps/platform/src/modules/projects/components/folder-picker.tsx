import { ArrowUp, Folder, FolderPlus, GitBranch } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { PanelNotice } from "@/components/panel-notice";
import { Skeleton } from "@/components/skeleton";

import { useFolderBrowser } from "../hooks/use-folder-browser";

type Props = {
  runtimeId: string;
  path: string;
  onChange: (path: string) => void;
};

export function FolderPicker({ runtimeId, path, onChange }: Props) {
  const { listing, creating, createFolder } = useFolderBrowser(runtimeId, path, onChange);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  async function submitName() {
    if (await createFolder(name)) {
      setNaming(false);
      setName("");
    }
  }

  const shown = listing?.data ?? null;
  let body = <Skeleton className="h-40 w-full" />;

  if (listing?.error) body = <PanelNotice>{listing.error}</PanelNotice>;
  else if (shown && shown.folders.length === 0) {
    body = <PanelNotice>No folders in here. Add this one, or make a new one.</PanelNotice>;
  } else if (shown) {
    body = (
      <ul className="flex max-h-56 flex-col overflow-y-auto">
        {shown.folders.map((folder) => (
          <li key={folder.path}>
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start gap-2 px-2 font-normal"
              onClick={() => onChange(folder.path)}
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
          disabled={!path}
          onClick={() => onChange(shown?.parent ?? "")}
        >
          <ArrowUp />
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
          {path || "Folders this computer serves"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="New folder"
          disabled={!path}
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
      <div className="rounded-md border">{body}</div>
    </div>
  );
}
