/** What the control plane says about a folder of a thread's workspace (`GET /threads/:id/files`). */
export type FolderResponse = { available: false } | { available: true; entries: FileEntry[] };

export type FileEntry = { name: string; type: "file" | "directory" };

/** A file as the control plane reads it (`GET /threads/:id/files/content`). */
export type FileResponse =
  | { available: false }
  | { available: true; kind: "missing" }
  | { available: true; kind: "binary"; size: number }
  | { available: true; kind: "text"; text: string; size: number; truncated: boolean };

/** What is kept of the explorer between visits: which folders and files are open. */
export type ExplorerState = {
  /** Folders opened in the tree, by path from the workspace's top. */
  expanded: string[];
  /** Files opened as tabs, in order. */
  open: string[];
  /** The tab that is showing. */
  active: string | null;
  /** Whether the file tree beside the file is shown. */
  treeShown: boolean;
};
