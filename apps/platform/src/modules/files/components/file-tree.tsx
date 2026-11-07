import { ChevronRight } from "@mynaui/icons-react";
import { cn } from "cn";

import { Button } from "@/components/button";

import { join } from "../paths";
import type { FileEntry } from "../types";
import { FileButton } from "./file-button";

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
            <FileButton
              key={path}
              path={path}
              label={entry.name}
              active={active === path}
              style={indent}
              onOpen={onOpenFile}
            />
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

export function FileTree(props: Props) {
  return <Nodes {...props} folder="" depth={0} />;
}
