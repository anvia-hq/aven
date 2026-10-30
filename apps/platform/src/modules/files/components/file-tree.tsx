import { ChevronRight, File } from "@mynaui/icons-react";
import { cn } from "cn";

import { Button } from "@/components/button";

import { join } from "../paths";
import type { FileEntry } from "../types";

type Props = {
  folders: Record<string, FileEntry[]>;
  expanded: string[];
  active: string | null;
  onToggleFolder: (path: string) => void;
  onOpenFile: (path: string) => void;
};

type NodeProps = Props & { folder: string; depth: number };

function Nodes({ folder, depth, ...rest }: NodeProps) {
  const { folders, expanded, active, onToggleFolder, onOpenFile } = rest;
  return (
    <>
      {(folders[folder] ?? []).map((entry) => {
        const path = join(folder, entry.name);
        const indent = { paddingLeft: `${depth * 0.875 + 0.5}rem` };
        if (entry.type === "file") {
          return (
            <Button
              key={path}
              variant="ghost"
              size="sm"
              className={cn("w-full justify-start font-normal", active === path && "bg-muted")}
              style={indent}
              onClick={() => onOpenFile(path)}
            >
              <File className="text-muted-foreground" />
              <span className="truncate">{entry.name}</span>
            </Button>
          );
        }
        const open = expanded.includes(path);
        return (
          <div key={path}>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start font-normal"
              style={indent}
              aria-expanded={open}
              onClick={() => onToggleFolder(path)}
            >
              <ChevronRight
                className={cn("text-muted-foreground transition-transform", open && "rotate-90")}
              />
              <span className="truncate">{entry.name}</span>
            </Button>
            {open && <Nodes {...rest} folder={path} depth={depth + 1} />}
          </div>
        );
      })}
    </>
  );
}

// The workspace's folders as a tree; a folder's contents are read when it is first opened.
export function FileTree(props: Props) {
  return <Nodes {...props} folder="" depth={0} />;
}

type MatchesProps = {
  folders: Record<string, FileEntry[]>;
  query: string;
  active: string | null;
  onOpenFile: (path: string) => void;
};

const MAX_MATCHES = 100;

// Files whose path holds what was typed, among the folders that have been opened.
export function FileMatches({ folders, query, active, onOpenFile }: MatchesProps) {
  const needle = query.trim().toLowerCase();
  const matches = Object.entries(folders)
    .flatMap(([folder, entries]) =>
      entries.filter((entry) => entry.type === "file").map((entry) => join(folder, entry.name)),
    )
    .filter((path) => path.toLowerCase().includes(needle))
    .sort()
    .slice(0, MAX_MATCHES);
  if (matches.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        No file matches in the folders that are open.
      </p>
    );
  }
  return (
    <>
      {matches.map((path) => (
        <Button
          key={path}
          variant="ghost"
          size="sm"
          className={cn("w-full justify-start font-normal", active === path && "bg-muted")}
          title={path}
          onClick={() => onOpenFile(path)}
        >
          <File className="text-muted-foreground" />
          <span className="truncate">{path}</span>
        </Button>
      ))}
    </>
  );
}
