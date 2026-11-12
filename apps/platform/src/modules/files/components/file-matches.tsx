import { join } from "../paths";
import type { FileEntry } from "../types";
import { FileButton } from "./file-button";

type Props = {
  folders: Record<string, FileEntry[]>;
  query: string;
  active: string | null;
  onOpenFile: (path: string) => void;
};

const MAX_MATCHES = 100;

export function FileMatches({ folders, query, active, onOpenFile }: Props) {
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
        <FileButton
          key={path}
          path={path}
          label={path}
          active={active === path}
          title={path}
          onOpen={onOpenFile}
        />
      ))}
    </>
  );
}
