export type FolderResponse = { available: false } | { available: true; entries: FileEntry[] };

export type FileEntry = { name: string; type: "file" | "directory" };

export type SearchResponse = { available: false } | { available: true; paths: string[] };

export type FileResponse =
  | { available: false }
  | { available: true; kind: "missing" }
  | { available: true; kind: "binary"; size: number }
  | { available: true; kind: "text"; text: string; size: number; truncated: boolean };

export type ExplorerState = {
  expanded: string[];
  open: string[];
  active: string | null;
  treeShown: boolean;
};
