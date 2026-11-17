import type { githubUrlsFromEnv } from "./app-manifest";

export type GithubUrls = ReturnType<typeof githubUrlsFromEnv>;
