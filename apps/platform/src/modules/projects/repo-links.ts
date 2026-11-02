// Where a project's repository is on GitHub, and where a link or an image of its README points
// once it is read away from the repository (decision 0082).

const GITHUB = "https://github.com";

export const repoUrl = (repo: string) => `${GITHUB}/${repo}`;

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** A file of the repository, on its default branch, on GitHub. */
export const blobUrl = (repo: string, branch: string, path: string) =>
  `${repoUrl(repo)}/blob/${branch}/${encodePath(path)}`;

/** A commit of the repository, on GitHub. */
export const commitUrl = (repo: string, sha: string) => `${repoUrl(repo)}/commit/${sha}`;

/**
 * What a README's link or image address points at: one with a scheme, a `#` anchor or `//` is
 * left as it is, and a relative one is made to point into the repository on GitHub, a link at the
 * file's page and an image at its raw bytes (which a private repository will not give a browser).
 */
export function resolveRepoUrl(href: string, repo: string, branch: string, kind: "link" | "image") {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return href;
  const base =
    kind === "image"
      ? `https://raw.githubusercontent.com/${repo}/${branch}/`
      : `${repoUrl(repo)}/blob/${branch}/`;
  // An address starting with `/` is from the top of the repository.
  return new URL(href.replace(/^\/+/, ""), base).href;
}
