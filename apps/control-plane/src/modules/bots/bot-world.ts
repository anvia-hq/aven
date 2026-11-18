import { UnprocessableError } from "@aven/server-kit/errors";

import { currentWork } from "./current-work";
import { projectSlugs, recentProjects, type ProjectBriefs } from "./project-briefs";
import type { BotThreads } from "../threads/types";
import type { BotWorldKeeper, BotWorldView, WorldSource } from "./types";

export const PROJECT_FILE_MAX_CHARS = 20_000;
export const PROJECT_FOLDER_ENTRIES_MAX = 200;

export class BotWorld implements BotWorldKeeper {
  constructor(
    private threads: Pick<BotThreads, "list">,
    private source: WorldSource,
    private briefs: Pick<ProjectBriefs, "forProjects">,
    private now: () => Date = () => new Date(),
  ) {}

  async forReply(userId: string): Promise<BotWorldView> {
    const [timezone, threads, tasks, inbox, projects] = await Promise.all([
      this.source.timezone(userId),
      this.threads.list(userId, {}),
      this.source.tasks(userId),
      this.source.inbox(userId),
      this.source.projects(userId),
    ]);
    const recent = recentProjects(projects, threads);
    const slugs = projectSlugs(recent);
    const briefs = await this.briefs.forProjects(recent);
    return {
      context: currentWork({
        now: this.now(),
        timezone,
        threads,
        tasks,
        inbox,
      }),
      projects: recent.map((project) => ({
        id: project.id,
        slug: slugs.get(project.id)!,
        repository: project.repository,
        brief: briefs.get(project.id),
      })),
    };
  }

  async #readable(userId: string, projectId: string) {
    const project = (await this.source.projects(userId)).find(({ id }) => id === projectId);

    if (!project)
      throw new UnprocessableError("There is no project with that id. Use list_projects.");

    if (!project.github) {
      throw new UnprocessableError(
        "Only GitHub projects can be read this way: this project is a folder on a computer.",
      );
    }

    return project.github;
  }

  async folder(userId: string, projectId: string, path = "") {
    const { installationId, repo } = await this.#readable(userId, projectId);
    const clean = path.replace(/^\/+|\/+$/g, "");
    const entries = await this.source.github.folder(installationId, repo, clean);

    if (!entries) throw new UnprocessableError(`There is no folder at "${clean}".`);

    return entries.slice(0, PROJECT_FOLDER_ENTRIES_MAX);
  }

  async file(userId: string, projectId: string, path: string) {
    const { installationId, repo } = await this.#readable(userId, projectId);
    const clean = path.replace(/^\/+|\/+$/g, "");
    const file = await this.source.github.file(installationId, repo, clean, PROJECT_FILE_MAX_CHARS);

    if (!file) throw new UnprocessableError(`There is no readable text file at "${clean}".`);

    return file;
  }
}
