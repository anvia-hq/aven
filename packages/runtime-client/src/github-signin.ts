import type { RunGithub } from "@aven/protocol/types";

const SIGN_IN = `set -e
umask 077
mkdir -p "$HOME/.config/gh"
printf 'github.com:\\n    oauth_token: %s\\n    user: %s\\n    git_protocol: https\\n' "$AVEN_GH_TOKEN" "$AVEN_GH_LOGIN" > "$HOME/.config/gh/hosts.yml"
git config --global --replace-all credential.https://github.com.helper '!gh auth git-credential'
git config --global user.name "$AVEN_GIT_NAME"
git config --global user.email "$AVEN_GIT_EMAIL"
`;

const SIGN_OUT = `set -e
rm -f "$HOME/.config/gh/hosts.yml"
git config --global --unset-all credential.https://github.com.helper || true
git config --global user.name "Aven"
git config --global user.email "aven@localhost"
`;

export function signInCommand(github: RunGithub | undefined) {
  if (!github) return { script: SIGN_OUT, env: {} as Record<string, string> };

  return {
    script: SIGN_IN,
    env: {
      AVEN_GH_TOKEN: github.token,
      AVEN_GH_LOGIN: github.login,
      AVEN_GIT_NAME: github.name ?? github.login,
      AVEN_GIT_EMAIL: `${github.id}+${github.login}@users.noreply.github.com`,
    },
  };
}

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
