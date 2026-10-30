import type { RunGithub } from "@aven/protocol/runtime-wire";

// What runs in the thread's container, as the container's user, to make `gh` and `git` act as the
// person for a run (decision 0044). The token and names come in the environment, never in the
// script or a command line, so the script is the same for everybody and nothing secret is in an
// argument the host's process list shows. Each step replaces the last run's, so a long-lived
// container never holds an expired token, and a run with no GitHub account signs the last one out.
const SIGN_IN = `set -e
umask 077
mkdir -p "$HOME/.config/gh"
printf 'github.com:\\n    oauth_token: %s\\n    user: %s\\n    git_protocol: https\\n' "$AVEN_GH_TOKEN" "$AVEN_GH_LOGIN" > "$HOME/.config/gh/hosts.yml"
git config --global --replace-all credential.https://github.com.helper '!gh auth git-credential'
git config --global user.name "$AVEN_GIT_NAME"
git config --global user.email "$AVEN_GIT_EMAIL"
`;

// Commits still work without a GitHub account, as Aven's, until the person connects one.
const SIGN_OUT = `set -e
rm -f "$HOME/.config/gh/hosts.yml"
git config --global --unset-all credential.https://github.com.helper || true
git config --global user.name "Aven"
git config --global user.email "aven@localhost"
`;

/** The command that signs the container in as `github`, or out when there is none. */
export function signInCommand(github: RunGithub | undefined) {
  if (!github) return { script: SIGN_OUT, env: {} as Record<string, string> };
  return {
    script: SIGN_IN,
    env: {
      AVEN_GH_TOKEN: github.token,
      AVEN_GH_LOGIN: github.login,
      AVEN_GIT_NAME: github.name ?? github.login,
      // The address GitHub links to the account whatever email its Aven account has.
      AVEN_GIT_EMAIL: `${github.id}+${github.login}@users.noreply.github.com`,
    },
  };
}
