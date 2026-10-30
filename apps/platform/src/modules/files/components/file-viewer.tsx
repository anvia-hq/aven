import { Skeleton } from "@/components/skeleton";

import { useWorkspaceFile } from "../hooks/use-workspace-file";

type Props = { threadId: string; path: string | null; running: boolean };

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex size-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      <p className="max-w-sm">{children}</p>
    </div>
  );
}

const KIB = 1024;

// A file as plain text with line numbers. It is only read, never changed from here.
export function FileViewer({ threadId, path, running }: Props) {
  const { loaded, file, problem } = useWorkspaceFile(threadId, path, running);
  if (path === null) return <Notice>Pick a file in the tree to read it.</Notice>;
  if (!loaded) return <Skeleton className="size-full rounded-none" />;
  if (problem) return <Notice>{problem}</Notice>;
  if (!file?.available) return <Notice>This thread has no workspace yet.</Notice>;
  if (file.kind === "missing") return <Notice>This file is no longer there.</Notice>;
  if (file.kind === "binary") {
    return <Notice>Binary file, {Math.ceil(file.size / KIB)} KiB. It is not shown.</Notice>;
  }
  // A final newline ends the last line; it does not start another.
  const lines = file.text.replace(/\n$/, "").split("\n");
  return (
    <div className="size-full overflow-auto font-mono text-xs leading-5">
      <div className="flex w-max min-w-full flex-col py-2">
        {lines.map((line, index) => (
          <div key={index} className="flex">
            <span className="w-12 shrink-0 select-none pr-3 text-right text-muted-foreground/60">
              {index + 1}
            </span>
            <span className="whitespace-pre pr-4">{line}</span>
          </div>
        ))}
        {file.truncated && (
          <p className="px-4 py-2 font-sans text-muted-foreground">
            The file is too large to show in full; the end of it is left out.
          </p>
        )}
      </div>
    </div>
  );
}
