import { BookOpen } from "@mynaui/icons-react";

import { Markdown } from "@/components/markdown";
import { SectionCard } from "@/components/section-card";
import { Skeleton } from "@/components/skeleton";

import { useProjectReadme } from "../hooks/use-project-readme";
import { isAbsoluteUrl, resolveRepoUrl } from "../repo-links";
import type { Project } from "../types";

export function RepoReadme({ project }: { project: Project }) {
  const { readme, problem, loading } = useProjectReadme(project.id);
  const repo = project.repoFullName ?? "";
  const branch = project.defaultBranch ?? "main";
  const onGithub = Boolean(project.repoFullName);

  if (!loading && (!readme || problem !== undefined)) return null;

  return (
    <SectionCard
      label="README"
      title={
        <>
          <BookOpen className="size-4 text-muted-foreground" />
          {readme?.name ?? "README"}
        </>
      }
    >
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
              a: ({ node: _node, href, children, ...props }) =>
                !onGithub && (!href || !isAbsoluteUrl(href)) ? (
                  <span>{children}</span>
                ) : (
                  <a
                    {...props}
                    href={href && onGithub ? resolveRepoUrl(href, repo, branch, "link") : href}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {children}
                  </a>
                ),
              img: ({ node: _node, src, alt, ...props }) =>
                !onGithub && (typeof src !== "string" || !isAbsoluteUrl(src)) ? null : (
                  <img
                    {...props}
                    alt={alt ?? ""}
                    src={
                      typeof src === "string" && onGithub
                        ? resolveRepoUrl(src, repo, branch, "image")
                        : src
                    }
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
    </SectionCard>
  );
}
