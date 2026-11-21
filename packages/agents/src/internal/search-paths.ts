import { posix } from "node:path";

import type { SearchableFiles } from "../tools/types";

export const SEARCH_TIMEOUT_MS = 30_000;

export const SKIPPED_DIRECTORIES = [".git", "node_modules"] as const;

export const DEFAULT_RESULTS = 100;

export const MAX_RESULTS = 500;

const decoder = new TextDecoder();

export function resolveWorkspacePath(
  workdir: string,
  input: string | undefined,
  options: { allowRoot?: boolean; escapeDash?: boolean } = {},
) {
  const raw = input ?? (options.allowRoot ? "." : "");
  const normalized = posix.normalize(raw.replaceAll("\\", "/"));
  const inside = posix.isAbsolute(normalized) ? posix.relative(workdir, normalized) : normalized;

  if (inside === ".." || inside.startsWith("../")) {
    throw new Error(
      options.allowRoot
        ? `Path is outside the workspace: ${input}`
        : `Path is not a file inside the workspace: ${input}`,
    );
  }

  if (inside === "" || inside === ".") {
    if (!options.allowRoot) {
      throw new Error(`Path is not a file inside the workspace: ${input}`);
    }

    return ".";
  }

  return options.escapeDash && inside.startsWith("-") ? `./${inside}` : inside;
}

export const searchRoot = (workdir: string, path: string | undefined) =>
  resolveWorkspacePath(workdir, path, { allowRoot: true, escapeDash: true });

const TYPE_TESTS = { file: ["-type", "f"], directory: ["-type", "d"], any: [] } as const;

const SKIP_TEST = SKIPPED_DIRECTORIES.flatMap((name) => ["-o", "-name", name]).slice(1);

export async function listPaths(
  files: SearchableFiles,
  options: {
    root: string;
    type: "file" | "directory" | "any";
    maxDepth?: number | undefined;
    abortSignal?: AbortSignal | undefined;
  },
) {
  const depth = options.maxDepth === undefined ? [] : ["-maxdepth", String(options.maxDepth)];
  const result = await files.exec({
    command: "find",
    args: [
      options.root,
      ...depth,
      "(",
      ...SKIP_TEST,
      ")",
      "-prune",
      "-o",
      ...TYPE_TESTS[options.type],
      "-print",
    ],
    cwd: files.workdir,
    timeoutMs: SEARCH_TIMEOUT_MS,
    abortSignal: options.abortSignal,
  });
  const text = decoder.decode(result.stdout);

  if (result.status === "exited" && result.exitCode !== 0 && text === "") {
    throw new Error(decoder.decode(result.stderr).trim() || `find exited with ${result.exitCode}`);
  }

  const prefix = options.root === "." ? "./" : `${options.root.replace(/\/$/, "")}/`;
  const paths = text.split("\n").flatMap((line) => {
    if (line === "" || line === options.root) return [];

    return [line.startsWith(prefix) ? line.slice(prefix.length) : line];
  });

  return { paths, cut: result.status === "timed_out" || result.stdoutTruncated };
}

export function withNotes(shown: readonly string[], notes: readonly string[]) {
  const present = notes.filter(Boolean);
  const lines = [...shown];

  if (present.length) lines.push(`[${present.join("; ")}; narrow the search]`);

  return lines.join("\n");
}

export function listing(paths: string[], limit: number, cut: boolean) {
  const sorted = [...paths].sort();

  return withNotes(sorted.slice(0, limit), [
    sorted.length > limit ? `${sorted.length - limit} more not shown` : "",
    cut ? "the directory listing was cut short" : "",
  ]);
}
