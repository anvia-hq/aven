import { oneLine } from "@aven/agents/bot-instruction";

import type { BriefSource, WorldGithub, WorldProject } from "./types";

export const BRIEF_MAX_CHARS = 800;
export const BRIEF_TTL_MS = 10 * 60_000;
export const BRIEF_TIMEOUT_MS = 4000;
export const BRIEF_PROJECTS = 8;
const BRIEF_SOURCE_READ = 4000;
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"];

export function briefOf(text: string) {
  const flat = oneLine(text);
  return flat.length > BRIEF_MAX_CHARS ? `${flat.slice(0, BRIEF_MAX_CHARS - 1)}…` : flat;
}

export class BriefCache {
  #entries = new Map<string, { brief: string | null; expiresAt: number }>();

  constructor(
    private ttlMs: number = BRIEF_TTL_MS,
    private now: () => number = Date.now,
  ) {}

  get(projectId: string) {
    const entry = this.#entries.get(projectId);

    if (!entry) return undefined;

    if (entry.expiresAt <= this.now()) {
      this.#entries.delete(projectId);
      return undefined;
    }

    return { brief: entry.brief };
  }

  set(projectId: string, brief: string | null) {
    this.#entries.set(projectId, { brief, expiresAt: this.now() + this.ttlMs });
  }
}

export async function fetchBrief(github: WorldGithub, source: BriefSource) {
  if (!source.github) return null;

  const { installationId, repo } = source.github;

  for (const path of INSTRUCTION_FILES) {
    const file = await github.file(installationId, repo, path, BRIEF_SOURCE_READ);

    if (file?.text.trim()) return briefOf(file.text);
  }

  const readme = await github.readme(installationId, repo);
  return readme?.text.trim() ? briefOf(readme.text) : null;
}

function withTimeout<T>(work: Promise<T>, ms: number) {
  const { promise, reject } = Promise.withResolvers<never>();
  const timer = setTimeout(() => reject(new Error("The brief took too long")), ms);
  return Promise.race([work, promise]).finally(() => clearTimeout(timer));
}

export class ProjectBriefs {
  constructor(
    private fetch: (source: BriefSource) => Promise<string | null>,
    private cache: BriefCache = new BriefCache(),
    private timeoutMs: number = BRIEF_TIMEOUT_MS,
  ) {}

  async forProjects(projects: readonly BriefSource[]) {
    const found = await Promise.all(
      projects.map(async (project) => {
        const cached = this.cache.get(project.id);

        if (cached) return [project.id, cached.brief] as const;

        try {
          const brief = await withTimeout(this.fetch(project), this.timeoutMs);
          this.cache.set(project.id, brief);
          return [project.id, brief] as const;
        } catch {
          return [project.id, null] as const;
        }
      }),
    );
    return new Map(found.flatMap(([id, brief]) => (brief ? [[id, brief] as const] : [])));
  }
}

export function recentProjects(
  projects: readonly WorldProject[],
  threads: readonly { projectId: string; updatedAt: string }[],
  max = BRIEF_PROJECTS,
) {
  const lastThread = new Map<string, number>();

  for (const thread of threads) {
    const at = Date.parse(thread.updatedAt);
    lastThread.set(thread.projectId, Math.max(lastThread.get(thread.projectId) ?? 0, at));
  }

  const rank = (project: WorldProject) => lastThread.get(project.id) ?? 0;
  return [...projects]
    .sort((a, b) => rank(b) - rank(a) || b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, max);
}

export function projectSlugs(projects: readonly { id: string; repository: string }[]) {
  const taken = new Set<string>();
  const slugs = new Map<string, string>();

  for (const project of projects) {
    const last = project.repository.split("/").filter(Boolean).at(-1) ?? "";
    const base =
      last
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "")
        .slice(0, 60) || "project";
    let slug = base;

    for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;

    taken.add(slug);
    slugs.set(project.id, slug);
  }

  return slugs;
}
