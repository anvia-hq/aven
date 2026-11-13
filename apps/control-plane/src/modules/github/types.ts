import type { githubUrlsFromEnv } from "./app-manifest";
import type { GithubClient } from "@aven/github/client";

export type GithubUrls = ReturnType<typeof githubUrlsFromEnv>;

export type AppClient = { key: string; client: GithubClient };

export type GithubClients = {
  forKey(appKey: string): Promise<GithubClient>;
  forOrganization(organizationId: string): Promise<AppClient>;
  forget(organizationId: string): void;
};
