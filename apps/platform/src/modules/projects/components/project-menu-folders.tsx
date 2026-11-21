import { IconArrowLeft, IconFolder, IconGitBranch } from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import type { Runtime } from "@/modules/runtimes/types";

import { useFolderBrowser } from "../hooks/use-folder-browser";
import type { FolderEntry, Project } from "../types";
import { matchesProjectQuery, MenuGroup, MenuNote, MenuSkeleton } from "./project-menu-parts";

type Props = {
  runtime: Runtime | undefined;
  query: string;
  projects: Project[];
  adding: boolean;
  onPick: (projectId: string) => void;
  onAdd: (path: string) => void;
};

function FolderRow({
  folder,
  project,
  disabled,
  onOpen,
  onAdd,
}: {
  folder: FolderEntry;
  project: Project | undefined;
  disabled: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-md pr-1 has-[>button:first-child:hover]:bg-accent">
      <Button
        type="button"
        variant="ghost"
        aria-pressed={Boolean(project)}
        className="h-8 min-w-0 flex-1 justify-start px-2 font-normal hover:bg-transparent!"
        onClick={onOpen}
      >
        <IconFolder className="text-muted-foreground" />
        <span className="truncate">{folder.name}</span>
        {folder.git && <IconGitBranch className="size-3.5 text-muted-foreground" />}
      </Button>
      {!project && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onAdd}
          className="hover:border-ring! hover:bg-accent!"
        >
          Add
        </Button>
      )}
    </div>
  );
}

export function ProjectMenuFolders({ runtime, query, projects, adding, onPick, onAdd }: Props) {
  const [browsing, setBrowsing] = useState("");
  const { listing } = useFolderBrowser(runtime?.id ?? "", browsing, setBrowsing);
  const shown = listing?.data ?? null;
  const folders = (shown?.folders ?? []).filter((folder) =>
    matchesProjectQuery(query, folder.name, folder.path),
  );

  if (!runtime) return <MenuNote>Choose a computer first.</MenuNote>;

  if (!runtime.online) return <MenuNote>{runtime.name} is offline.</MenuNote>;

  if (runtime.directories.length === 0)
    return (
      <MenuNote>
        {runtime.name} serves no folders. Start its runner with the folders it may use.
      </MenuNote>
    );

  return (
    <MenuGroup label="Folders">
      <div className="flex items-center gap-1 px-1 pb-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Up one folder"
          disabled={!browsing}
          onClick={() => setBrowsing(shown?.parent ?? "")}
        >
          <IconArrowLeft />
        </Button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {browsing || "Folders this computer serves"}
        </span>
      </div>
      {listing?.error && <MenuNote>{listing.error}</MenuNote>}
      {!shown && !listing?.error && <MenuSkeleton />}
      {folders.map((folder) => {
        const project = projects.find(
          (entry) => entry.runtimeId === runtime.id && entry.directory === folder.path,
        );
        return (
          <FolderRow
            key={folder.path}
            folder={folder}
            project={project}
            disabled={adding && !project}
            onOpen={() => (project ? onPick(project.id) : setBrowsing(folder.path))}
            onAdd={() => (project ? onPick(project.id) : onAdd(folder.path))}
          />
        );
      })}
      {shown && folders.length === 0 && <MenuNote>No folder matches.</MenuNote>}
    </MenuGroup>
  );
}
