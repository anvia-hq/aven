const GITHUB = "https://github.com";

export const repoUrl = (repo: string) => `${GITHUB}/${repo}`;

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export const blobUrl = (repo: string, branch: string, path: string) =>
  `${repoUrl(repo)}/blob/${branch}/${encodePath(path)}`;

export const commitUrl = (repo: string, sha: string) => `${repoUrl(repo)}/commit/${sha}`;

export const isAbsoluteUrl = (href: string) => /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href);

export function resolveRepoUrl(href: string, repo: string, branch: string, kind: "link" | "image") {
  if (isAbsoluteUrl(href)) return href;

  const base =
    kind === "image"
      ? `https://raw.githubusercontent.com/${repo}/${branch}/`
      : `${repoUrl(repo)}/blob/${branch}/`;
  return new URL(href.replace(/^\/+/, ""), base).href;
}
