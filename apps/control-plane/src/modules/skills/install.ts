import { MAX_SKILL_BYTES, MAX_SKILL_FILES } from "@aven/protocol/skills";

import type { SkillCandidate, ResolvedSkill, SkillSource } from "./types";

const GITHUB_API = "https://api.github.com";

function apiUrl() {
  return (process.env.GITHUB_API_URL ?? GITHUB_API).replace(/\/+$/, "");
}

const MAX_CANDIDATES = 100;

const SKILL_FILE = "SKILL.md";

const SHORTHAND = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@([A-Za-z0-9_.-]+))?$/;

const SSH = /^git@([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/;

const JUNK = new Set([".git", "node_modules", "__MACOSX"]);

export class SkillInstallError extends Error {}

export type SkillFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type InstallOptions = {
  folder?: string | null;
  token?: string | null;
  fetch?: SkillFetch;
};

type TreeEntry = { path: string; mode: string; type: string; sha: string; size?: number };

type Tree = { tree: TreeEntry[]; truncated?: boolean };

type Blob = { content: string; encoding: string };

const megabytes = (bytes: number) => `${bytes / 1024 / 1024} MB`;

function askFor(): never {
  throw new SkillInstallError(
    "Give a skill as owner/repo, owner/repo@skill-name, a github.com link to the folder, or a skills.sh link",
  );
}

function segmentsOf(pathname: string) {
  const parts: string[] = [];

  for (const part of pathname.split("/")) {
    if (part.length > 0) parts.push(decodeURIComponent(part));
  }

  return parts;
}

function withoutGit(name: string) {
  return name.endsWith(".git") ? name.slice(0, -4) : name;
}

function folderOf(path: string) {
  return path.split("/").slice(0, -1).join("/");
}

function skillSource(
  owner: string,
  repo: string,
  { ref = null, folder = null, name = null }: Partial<SkillSource>,
): SkillSource {
  return { owner, repo: withoutGit(repo), ref, folder, name };
}

function fromPath(pathname: string, owner: string, repo: string): SkillSource {
  const [kind, ref, ...rest] = segmentsOf(pathname).slice(2);

  if (kind === undefined) return skillSource(owner, repo, {});

  const path = rest.join("/");

  if (kind === "tree") return skillSource(owner, repo, { ref: ref ?? null, folder: path });

  if (kind === "blob" && path.split("/").at(-1) === SKILL_FILE)
    return skillSource(owner, repo, { ref: ref ?? null, folder: folderOf(path) });

  return askFor();
}

function fromGithub({ hostname, pathname }: URL): SkillSource {
  const [owner, repo] = segmentsOf(pathname);

  if (hostname === "raw.githubusercontent.com") {
    const [, , ref, ...rest] = segmentsOf(pathname);
    const path = rest.join("/");

    if (!owner || !repo || !ref || path.split("/").at(-1) !== SKILL_FILE) return askFor();

    return skillSource(owner, repo, { ref, folder: folderOf(path) });
  }

  if (!owner || !repo) return askFor();

  return fromPath(pathname, owner, repo);
}

function fromSkillsSh({ pathname }: URL): SkillSource {
  const [owner, repo, name] = segmentsOf(pathname);

  if (!owner || !repo || owner === "p")
    throw new SkillInstallError(
      "A skills.sh pack cannot be installed from its link. Install one of its skills from the skill's own page instead",
    );

  return skillSource(owner, repo, { name: name ?? null });
}

export function parseSkillSource(input: string): SkillSource {
  const text = input.trim();

  if (text.length === 0) askFor();

  if (/^(\.{1,2}\/|\/|~)/.test(text))
    throw new SkillInstallError(
      "A folder on a computer is uploaded, not installed from its path: use Upload folder above",
    );

  const ssh = SSH.exec(text);

  if (ssh) {
    const [, host, owner, repo] = ssh;

    if (host !== "github.com") return askFor();

    return skillSource(owner!, repo!, {});
  }

  const shorthand = SHORTHAND.exec(text);

  if (shorthand) return skillSource(shorthand[1]!, shorthand[2]!, { name: shorthand[3] ?? null });

  let url: URL;

  try {
    url = new URL(text);
  } catch {
    return askFor();
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  if (url.protocol !== "https:" && url.protocol !== "http:") return askFor();

  if (hostname === "github.com" || hostname === "raw.githubusercontent.com") return fromGithub(url);

  if (hostname === "skills.sh") return fromSkillsSh(url);

  return askFor();
}

export function skillCandidates(tree: readonly TreeEntry[], repo: string): SkillCandidate[] {
  const byName = new Map<string, SkillCandidate>();

  for (const entry of [...tree].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = entry.path.split("/");

    if (entry.type !== "blob" || entry.mode === "120000") continue;

    if (parts.at(-1) !== SKILL_FILE || parts.some((part) => JUNK.has(part))) continue;

    const folder = folderOf(entry.path);
    const name = parts.length > 1 ? parts[parts.length - 2]! : repo;

    if (!byName.has(name)) byName.set(name, { name, folder });
  }

  return [...byName.values()];
}

function named(candidates: readonly SkillCandidate[], source: SkillSource): string {
  const names = candidates.map((candidate) => candidate.name).join(", ");
  const picked = candidates.find((candidate) => candidate.name === source.name);

  if (!picked)
    throw new SkillInstallError(
      `${source.owner}/${source.repo} has no skill named ${source.name}. It has: ${names}`,
    );

  return picked.folder;
}

function folderOfSkill(
  candidates: readonly SkillCandidate[],
  source: SkillSource,
  wanted: string | null,
): string | null {
  if (wanted !== null) {
    const inside = [...candidates]
      .filter(
        (candidate) =>
          candidate.folder === "" ||
          wanted === candidate.folder ||
          wanted.startsWith(`${candidate.folder}/`),
      )
      .sort((a, b) => b.folder.length - a.folder.length)[0];

    if (!inside)
      throw new SkillInstallError(
        `${source.owner}/${source.repo} has no skill in ${wanted || "the repository's top"}`,
      );

    return inside.folder;
  }

  if (source.name !== null) return named(candidates, source);

  if (candidates.length === 0)
    throw new SkillInstallError(`There is no ${SKILL_FILE} in ${source.owner}/${source.repo}`);

  if (candidates.length === 1) return candidates[0]!.folder;

  if (candidates.length > MAX_CANDIDATES)
    throw new SkillInstallError(
      `${source.owner}/${source.repo} has ${candidates.length} skills. Name one after an @, as in ${source.owner}/${source.repo}@<name>`,
    );

  return null;
}

function headers(token: string | null): Record<string, string> {
  const base = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "aven",
  };

  if (token === null) return base;

  return { ...base, authorization: `Bearer ${token}` };
}

async function githubJson<T>(
  fetcher: SkillFetch,
  url: string,
  token: string | null,
  missing: string,
): Promise<T> {
  const response = await fetcher(url, { headers: headers(token) });

  if (response.status === 404) throw new SkillInstallError(missing);

  if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
    throw new SkillInstallError("GitHub's rate limit is spent. Try again in an hour");

  if (!response.ok) throw new SkillInstallError(`GitHub answered ${response.status}`);

  return (await response.json()) as T;
}

function refPath(ref: string) {
  return ref.split("/").map(encodeURIComponent).join("/");
}

async function treeOf(source: SkillSource, token: string | null, fetcher: SkillFetch) {
  const ref = source.ref ?? "HEAD";
  const tree = await githubJson<Tree>(
    fetcher,
    `${apiUrl()}/repos/${source.owner}/${source.repo}/git/trees/${refPath(ref)}?recursive=1`,
    token,
    `GitHub has no ${source.owner}/${source.repo} this account can read, or none with ${ref}`,
  );

  if (tree.truncated)
    throw new SkillInstallError(`${source.owner}/${source.repo} is too large for GitHub to list`);

  return tree;
}

async function filesUnder(
  source: SkillSource,
  tree: Tree,
  folder: string,
  token: string | null,
  fetcher: SkillFetch,
) {
  const prefix = folder.length === 0 ? "" : `${folder}/`;
  const entries = tree.tree.filter(
    (entry) => entry.type === "blob" && entry.mode !== "120000" && entry.path.startsWith(prefix),
  );

  if (entries.length > MAX_SKILL_FILES)
    throw new SkillInstallError(`A skill can have at most ${MAX_SKILL_FILES} files`);

  const size = entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0);

  if (size > MAX_SKILL_BYTES)
    throw new SkillInstallError(`A skill can be at most ${megabytes(MAX_SKILL_BYTES)}`);

  const files = new Map<string, Uint8Array>();

  for (const entry of entries) {
    const blob = await githubJson<Blob>(
      fetcher,
      `${apiUrl()}/repos/${source.owner}/${source.repo}/git/blobs/${entry.sha}`,
      token,
      `${entry.path} could not be read from ${source.owner}/${source.repo}`,
    );

    if (blob.encoding !== "base64")
      throw new SkillInstallError(`${entry.path} is not a file GitHub can hand over`);

    files.set(
      entry.path.slice(prefix.length),
      Uint8Array.fromBase64(blob.content.replace(/\s+/g, "")),
    );
  }

  return files;
}

export async function resolveSkill(
  input: string,
  options: InstallOptions = {},
): Promise<ResolvedSkill> {
  const source = parseSkillSource(input);
  const token = options.token ?? null;
  const fetcher = options.fetch ?? fetch;
  const tree = await treeOf(source, token, fetcher);
  const candidates = skillCandidates(tree.tree, source.repo);
  const folder = folderOfSkill(candidates, source, options.folder ?? source.folder);

  if (folder === null) return { status: "choose", choices: candidates };

  return {
    status: "skill",
    folder,
    files: await filesUnder(source, tree, folder, token, fetcher),
  };
}
