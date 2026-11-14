import type { RunnerGithub, RuntimeGithubMode } from "@aven/protocol/types";

export function githubIdentityNote(
  runnerGithub: RunnerGithub | null,
  githubMode: RuntimeGithubMode = "machine",
) {
  if (githubMode === "person")
    return {
      label: "GitHub: your account",
      detail:
        "Runs on this runner use the GitHub account you connected, not the machine's own login.",
    };

  if (!runnerGithub) return null;

  if (runnerGithub.login === null)
    return {
      label: "No GitHub",
      detail:
        "Runs on this runner use the machine's own GitHub login, not your connected account. gh is not signed in here; git may still push with its own credentials.",
    };

  return {
    label: `GitHub: this machine (@${runnerGithub.login})`,
    detail: `Runs on this runner use the machine's own GitHub login, not your connected account. gh here is signed in as @${runnerGithub.login}.`,
  };
}
