import type { FileContent, FileEntry } from "@aven/protocol/runtime-wire";
import type { Available } from "../runtimes/types";

export type FolderResult = Available<{ entries: FileEntry[] }>;

export type FileResult = Available<FileContent>;

export type SearchResult = Available<{ paths: string[] }>;
