import type { FileContent, FileEntry } from "@aven/protocol/types";
import type { ThemedToken } from "shiki";

export type { FileEntry };

export type FolderResponse = { available: false } | { available: true; entries: FileEntry[] };

export type SearchResponse =
  | { available: false }
  | { available: true; paths: string[]; folders: string[] };

export type FileResponse = { available: false } | ({ available: true } & FileContent);

export type ExplorerState = {
  expanded: string[];
  open: string[];
  active: string | null;
  treeShown: boolean;
};

export type HighlightedLine = ThemedToken[];

export type FileIconTheme = {
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  iconDefinitions: Record<string, { iconPath: string }>;
  file: string;
};
