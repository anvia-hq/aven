import type { githubUrlsFromEnv } from "./app-manifest";
import type { GithubInstallationAccountType, GithubNewRepository } from "@aven/github/types";

export type GithubUrls = ReturnType<typeof githubUrlsFromEnv>;

export type GithubInstallationInfo = {
  accountLogin: string;
  accountType: GithubInstallationAccountType;
  canCreateRepository: boolean;
  settingsUrl: string;
};

export type CreatedGithubRepository = {
  repository: GithubNewRepository;
  reachable: boolean;
};
