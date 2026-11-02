import { BookOpen } from "@mynaui/icons-react";

import { Markdown } from "@/components/markdown";
import { Skeleton } from "@/components/skeleton";

import { useProjectReadme } from "../hooks/use-project-readme";
import { resolveRepoUrl } from "../repo-links";
import type { Project } from "../types";

// The project's README, drawn as it is on a repository page. Its relative links and images are
// made to point into the repository on GitHub (decision 0082).
export function RepoReadme({ project }: { project: Project }) {
  const { readme, problem, loading } = useProjectReadme(project.id);
  const { repoFullName: repo, defaultBranch: branch } = project;

  // No README, or one that cannot be read, is no section at all.
  if (!loading && (!readme || problem !== undefined)) return null;

  return (
    <section aria-label="README" className="overflow-hidden rounded-xl border bg-card">
      <div className="flex h-11 items-center gap-2 border-b px-4 text-sm font-medium">
        <BookOpen className="size-4 text-muted-foreground" />
        {readme?.name ?? "README"}
      </div>
      <div className="p-6">
        {loading && (
          <div className="flex flex-col gap-2" aria-busy>
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}
        {readme && (
          <Markdown
            components={{
              a: ({ node: _node, href, children, ...props }) => (
                <a
                  {...props}
                  href={href ? resolveRepoUrl(href, repo, branch, "link") : href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {children}
                </a>
              ),
              img: ({ node: _node, src, alt, ...props }) => (
                <img
                  {...props}
                  alt={alt ?? ""}
                  src={typeof src === "string" ? resolveRepoUrl(src, repo, branch, "image") : src}
                  className="max-w-full"
                />
              ),
            }}
          >
            {readme.text}
          </Markdown>
        )}
        {readme?.truncated && (
          <p className="mt-4 text-xs text-muted-foreground">
            The README is long, and only its start is shown.
          </p>
        )}
      </div>
    </section>
  );
}
