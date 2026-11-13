import type { RunnerGithub, RuntimeGithubMode } from "@aven/protocol/types";

export const GITHUB_MODE_OPTIONS: { value: RuntimeGithubMode; label: string }[] = [
  { value: "machine", label: "This machine's GitHub login" },
  { value: "person", label: "Each person's own account" },
];

export function githubModeNote(mode: RuntimeGithubMode, machine: RunnerGithub | null) {
  if (mode === "person")
    return "Each run acts as the person who sent the message, with the GitHub account they connected. Someone who has not connected one gets no GitHub on this runner, and the machine's own login is not used.";

  if (machine === null)
    return "Every run acts as whoever gh and git are signed in as on this machine, whoever sent the message. This runner has not said which login that is.";

  if (machine.login === null)
    return "Every run acts as whoever gh and git are signed in as on this machine, whoever sent the message. gh is not signed in here; git may still push with its own credentials.";

  return `Every run acts as @${machine.login}, the login gh is signed in as on this machine, whoever sent the message.`;
}
