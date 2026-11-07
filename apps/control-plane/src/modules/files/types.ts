import type { Available } from "../runtimes/types";
import type { FileContent, FileEntry } from "@aven/protocol/types";

export type FolderResult = Available<{ entries: FileEntry[] }>;

export type FileResult = Available<FileContent>;

export type SearchResult = Available<{ paths: string[] }>;
