import type { GithubAuth } from "./auth";
import {
  GithubApiError,
  GithubRepositoryNotCreatedError,
  GithubUserRequiredError,
  nullWhenNotFound,
} from "./errors";
import type {
  ContentsEntryPayload,
  FileContentPayload,
  InstallationRepositoriesPayload,
  ReadmePayload,
  RepositoryListEntryPayload,
  RepositoryPayload,
  RepositoryPermissionsPayload,
} from "./payload-types";
import { contentsPath, repoPath, type GithubTransport } from "./transport";
import type {
  GithubCreateRepositoryInput,
  GithubFile,
  GithubInstallation,
  GithubNewRepository,
  GithubReadme,
  GithubRepository,
  GithubTreeEntry,
} from "./types";

export const README_MAX_CHARS = 200_000;

export class GithubRepositories {
  constructor(
    private readonly transport: GithubTransport,
    private readonly auth: GithubAuth,
  ) {}

  async installation(installationId: number): Promise<GithubInstallation> {
    const found = await this.auth.fetchInstallation(installationId);
    return {
      installationId: found.id,
      accountLogin: found.account?.login ?? "unknown",
      accountType: found.account?.type === "Organization" ? "organization" : "user",
      selectedRepositories: found.repository_selection === "selected",
      canCreateRepositories: found.permissions?.administration === "write",
    };
  }

  async repositories(installationId: number): Promise<GithubRepository[]> {
    return this.auth.withInstallationToken(installationId, async (token) => {
      const found: GithubRepository[] = [];

      for await (const repo of this.transport.pages<
        InstallationRepositoriesPayload,
        RepositoryListEntryPayload
      >("/installation/repositories", token, (page) => page.repositories)) {
        found.push({
          fullName: repo.full_name,
          cloneUrl: repo.clone_url,
          defaultBranch: repo.default_branch,
          private: repo.private,
        });
      }

      return found.sort((a, b) =>
        a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" }),
      );
    });
  }

  async #create(path: string, auth: string, body: Record<string, unknown>, fullName: string) {
    try {
      return await this.transport.post<RepositoryPayload>(path, auth, body);
    } catch (error) {
      if (error instanceof GithubApiError && error.status >= 400 && error.status < 500) {
        throw new GithubRepositoryNotCreatedError(fullName);
      }

      throw error;
    }
  }

  async createRepository(
    installationId: number,
    input: GithubCreateRepositoryInput,
  ): Promise<GithubNewRepository> {
    const fullName = `${input.owner}/${input.name}`;
    const body = { name: input.name, private: input.private, auto_init: true };
    let created: RepositoryPayload;

    if (input.accountType === "organization") {
      const token = await this.auth.writeToken(installationId, input.owner);
      created = await this.#create(
        `/orgs/${encodeURIComponent(input.owner)}/repos`,
        token,
        body,
        fullName,
      );
    } else {
      if (input.userToken === null) throw new GithubUserRequiredError();

      created = await this.#create("/user/repos", input.userToken, body, fullName);
    }

    return {
      id: created.id,
      fullName: created.full_name,
      cloneUrl: created.clone_url,
      defaultBranch: created.default_branch,
      private: created.private,
    };
  }

  async addRepositoryToInstallation(
    installationId: number,
    userToken: string,
    repositoryId: number,
  ) {
    try {
      await this.transport.put(
        `/user/installations/${installationId}/repositories/${repositoryId}`,
        userToken,
      );
      return true;
    } catch (error) {
      if (error instanceof GithubApiError) return false;

      throw error;
    }
  }

  async canReach(installationId: number, fullName: string) {
    return this.auth.withInstallationToken(installationId, async (token) => {
      const found = await this.transport
        .get<RepositoryPermissionsPayload>(repoPath(fullName), token)
        .catch(nullWhenNotFound);
      return found !== null;
    });
  }

  async canWrite(installationId: number) {
    const found = await this.auth.fetchInstallation(installationId);
    return found.permissions?.contents === "write" && found.permissions?.pull_requests === "write";
  }

  async canPush(userToken: string, fullName: string) {
    const found = await this.transport
      .get<RepositoryPermissionsPayload>(repoPath(fullName), userToken)
      .catch(nullWhenNotFound);
    return found?.permissions?.push === true;
  }

  async folder(
    installationId: number,
    fullName: string,
    path: string,
  ): Promise<GithubTreeEntry[] | null> {
    return this.auth.withInstallationToken(installationId, async (token) => {
      const listed = await this.transport
        .get<ContentsEntryPayload[] | object>(
          `${repoPath(fullName)}/contents${contentsPath(path)}`,
          token,
        )
        .catch(nullWhenNotFound);

      if (!Array.isArray(listed)) return null;

      const entries = listed.map(({ name, path: entryPath, type }): GithubTreeEntry => ({
        name,
        path: entryPath,
        type: type === "dir" ? "directory" : "file",
      }));
      return entries.sort(
        (a, b) =>
          Number(b.type === "directory") - Number(a.type === "directory") ||
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
    });
  }

  async readme(installationId: number, fullName: string): Promise<GithubReadme | null> {
    return this.auth.withInstallationToken(installationId, async (token) => {
      const found = await this.transport
        .get<ReadmePayload>(`${repoPath(fullName)}/readme`, token)
        .catch(nullWhenNotFound);

      if (!found?.content || found.encoding !== "base64") return null;

      const text = Buffer.from(found.content, "base64").toString("utf8");
      return {
        name: found.name,
        path: found.path,
        text: text.slice(0, README_MAX_CHARS),
        truncated: text.length > README_MAX_CHARS,
      };
    });
  }

  async file(
    installationId: number,
    fullName: string,
    path: string,
    maxChars: number,
  ): Promise<GithubFile | null> {
    return this.auth.withInstallationToken(installationId, async (token) => {
      const found = await this.transport
        .get<FileContentPayload>(`${repoPath(fullName)}/contents${contentsPath(path)}`, token)
        .catch(nullWhenNotFound);

      if (!found || found.type !== "file" || found.encoding !== "base64") return null;

      const text = Buffer.from(found.content ?? "", "base64").toString("utf8");

      if (text.includes("\u0000")) return null;

      return {
        path: found.path ?? path,
        text: text.slice(0, maxChars),
        truncated: text.length > maxChars,
      };
    });
  }
}
