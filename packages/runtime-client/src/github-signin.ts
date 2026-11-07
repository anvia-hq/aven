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
