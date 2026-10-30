import { createTool } from "@anvia/core";
import { z } from "zod";

export const GIT_FETCH_TOOL_NAME = "git_fetch";

/** What a fetch did: where `origin/<branch>` is now and where it was (null if it was not there). */
export type FetchedBranch = { branch: string; commit: string; previous: string | null };

/** Fetches a branch of the thread's repository into its workspace as `origin/<branch>`. */
export type FetchRemote = (
  branch: string | undefined,
  abortSignal?: AbortSignal,
) => Promise<FetchedBranch>;

// Brings a branch from GitHub into the workspace, for an agent that is not signed in to GitHub
// because its person has not connected their account (decisions 0042 and 0044). What fetches is the
// host; this only says what the agent can ask for and what to do with the answer.
export function createGitFetchTool(fetchRemote: FetchRemote) {
  return createTool({
    name: GIT_FETCH_TOOL_NAME,
    description:
      "Fetch a branch of the project's GitHub repository into the workspace as origin/<branch>, so you can bring the thread up to date or look at another branch. Leave out `branch` for the repository's default branch. It changes only origin/<branch>, not your files or your branch: then use git in the workspace, such as `git merge origin/main`, `git rebase origin/main` or `git checkout -b try origin/other`. Use it when plain git fetch fails because you are not signed in to GitHub (the user has not connected their account); when you are signed in, plain git works.",
    inputSchema: z.object({
      branch: z
        .string()
        .min(1)
        .optional()
        .describe(
          "The branch to fetch, such as main or feature/x. Defaults to the default branch.",
        ),
    }),
    async execute({ branch }, context) {
      const fetched = await fetchRemote(branch, context?.abortSignal);
      const ref = `origin/${fetched.branch}`;
      const updated = fetched.commit !== fetched.previous;
      return {
        ref,
        commit: fetched.commit,
        updated,
        // Said in words so the agent does not have to work out what changed.
        summary: updated
          ? `${ref} is now at ${fetched.commit.slice(0, 7)}${fetched.previous ? ` (was ${fetched.previous.slice(0, 7)})` : ""}.`
          : `${ref} was already up to date at ${fetched.commit.slice(0, 7)}.`,
      };
    },
  });
}
