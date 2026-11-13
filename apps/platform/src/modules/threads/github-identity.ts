import type { RunnerGithub } from "@aven/protocol/types";

export function githubIdentityNote(runnerGithub: RunnerGithub | null) {
  if (!runnerGithub) return null;

  if (runnerGithub.login === null)
    return {
      label: "GitHub: this machine, not signed in",
      detail:
        "Runs on this runner use the machine's own GitHub login, not your connected account. gh is not signed in here; git may still push with its own credentials.",
    };

  return {
    label: `GitHub: this machine (@${runnerGithub.login})`,
    detail: `Runs on this runner use the machine's own GitHub login, not your connected account. gh here is signed in as @${runnerGithub.login}.`,
  };
}
