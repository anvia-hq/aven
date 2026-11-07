import { createTool } from "@anvia/core";
import { z } from "zod";
import type { FetchRemote } from "./types";

export const GIT_FETCH_TOOL_NAME = "git_fetch";

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
        summary: updated
          ? `${ref} is now at ${fetched.commit.slice(0, 7)}${fetched.previous ? ` (was ${fetched.previous.slice(0, 7)})` : ""}.`
          : `${ref} was already up to date at ${fetched.commit.slice(0, 7)}.`,
      };
    },
  });
}
