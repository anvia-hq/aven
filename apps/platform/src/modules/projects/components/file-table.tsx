import { File as FileIcon, Folder } from "@mynaui/icons-react";

import { Avatar, AvatarFallback } from "@/components/avatar";
import { timeAgo } from "@/lib/format";

import type { Commit, FileEntry } from "../types";

type Props = {
  files: FileEntry[];
  lastCommit?: Commit;
};

export function FileTable({ files, lastCommit }: Props) {
  return (
    <section aria-label="Files" className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Files</h2>
      <div className="overflow-hidden rounded-lg border">
        {lastCommit && (
          <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-3 text-sm">
            <Avatar size="sm">
              <AvatarFallback>{lastCommit.author.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{lastCommit.author}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {lastCommit.message}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{lastCommit.hash}</span>
            <span className="text-xs text-muted-foreground">{timeAgo(lastCommit.at)}</span>
          </div>
        )}
        <ul className="divide-y">
          {files.map((file) => (
            <li key={file.name} className="flex items-center gap-3 px-4 py-2 text-sm">
              {file.type === "dir" ? (
                <Folder className="size-4 text-muted-foreground" />
              ) : (
                <FileIcon className="size-4 text-muted-foreground" />
              )}
              <span className="w-56 shrink-0 truncate font-mono text-xs">{file.name}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{file.message}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(file.at)}</span>
            </li>
          ))}
          {files.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">No files yet.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
