import type { GithubInstallationAccountType, GithubNewRepository } from "@aven/github/types";

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
