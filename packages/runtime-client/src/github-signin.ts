import type { RunGithub } from "@aven/protocol/types";

export function githubRunEnv(github: RunGithub, configDir: string): Record<string, string> {
  const name = github.name ?? github.login;
  const email = `${github.id}+${github.login}@users.noreply.github.com`;
  return {
    GH_TOKEN: github.token,
    GITHUB_TOKEN: github.token,
    GH_CONFIG_DIR: configDir,
    GH_PROMPT_DISABLED: "1",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "",
    GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
    GIT_CONFIG_VALUE_1: "!gh auth git-credential",
    GIT_AUTHOR_NAME: name,
    GIT_AUTHOR_EMAIL: email,
    GIT_COMMITTER_NAME: name,
    GIT_COMMITTER_EMAIL: email,
  };
}
