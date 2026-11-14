import { Check, CircleDashed, ExternalLink, X, XCircle } from "@mynaui/icons-react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@aven/ui/drawer";
import { Markdown } from "@/components/markdown";
import { Skeleton } from "@aven/ui/skeleton";
import { useRequest } from "@/hooks/use-request";
import { timeAgo } from "@/lib/format";
import { DiffFileCard } from "@/modules/diff/components/diff-file-card";
import { DiffStat } from "@/modules/diff/components/diff-stat";
import { TRACKED_STATUS } from "@/modules/projects/components/repo-tracked";

import { diffFilesOf } from "../files-patch";
import type { CheckRun, CommitDetail, FileChange, PullDetail } from "../types";

type Open =
  | { kind: "pr"; projectId: string; what: string }
  | { kind: "commit"; projectId: string; what: string };

export function openOf(search: { pr?: string; commit?: string }): Open | undefined {
  const [kind, value] = search.pr
    ? (["pr", search.pr] as const)
    : (["commit", search.commit] as const);

  if (!value) return undefined;

  const [projectId, what] = value.split(":") as [string, string];
  return { kind, projectId, what };
}

function Files({ files, truncated }: { files: FileChange[]; truncated: boolean }) {
  const parsed = diffFilesOf(files);
  return (
    <section aria-label="Files changed" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        Files changed <span className="text-muted-foreground">{files.length}</span>
      </h3>
      {parsed.map((file) => (
        <DiffFileCard key={file.path} file={file} layout="unified" />
      ))}
      {truncated && (
        <p className="text-xs text-muted-foreground">
          There are more files than are shown here. The rest are on GitHub.
        </p>
      )}
    </section>
  );
}

const CHECK_ICON = {
  success: <Check className="size-4 text-success" />,
  failure: <XCircle className="size-4 text-destructive" />,
  pending: <CircleDashed className="size-4 text-muted-foreground" />,
} as const;

function Checks({ checks }: { checks: PullDetail["checks"] }) {
  if (checks.state === "none") return null;

  return (
    <section aria-label="Checks" className="flex flex-col gap-1.5">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        Checks {CHECK_ICON[checks.state]}
      </h3>
      <ul className="flex flex-col text-sm">
        {checks.runs.map((run: CheckRun) => (
          <li key={run.name} className="flex items-center gap-2 py-0.5">
            {CHECK_ICON[run.state]}
            {run.url ? (
              <a
                href={run.url}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:underline"
              >
                {run.name}
              </a>
            ) : (
              run.name
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const REVIEW_LABEL = {
  approved: "Approved",
  changes_requested: "Requested changes",
  commented: "Commented",
  dismissed: "Dismissed",
} as const;

function People({ pull }: { pull: PullDetail }) {
  if (pull.reviews.length === 0 && pull.requestedReviewers.length === 0) return null;

  return (
    <section aria-label="Reviewers" className="flex flex-col gap-1.5">
      <h3 className="text-sm font-medium">Reviewers</h3>
      <ul className="flex flex-wrap gap-1.5 text-sm">
        {pull.reviews.map((review) => (
          <li key={review.login}>
            <Badge variant={review.state === "approved" ? "secondary" : "outline"}>
              {review.login} · {REVIEW_LABEL[review.state]}
            </Badge>
          </li>
        ))}
        {pull.requestedReviewers.flatMap((login) =>
          pull.reviews.some((review) => review.login === login)
            ? []
            : [
                <li key={login}>
                  <Badge variant="outline">{login} · Review requested</Badge>
                </li>,
              ],
        )}
      </ul>
    </section>
  );
}

function Header({ title, subtitle, url }: { title: string; subtitle: string; url: string }) {
  return (
    <header className="flex items-start gap-3 border-b px-5 py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <DrawerTitle className="text-lg leading-snug font-semibold break-words">
          {title}
        </DrawerTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href={url} target="_blank" rel="noreferrer noopener" />}
      >
        <ExternalLink />
        GitHub
      </Button>
      <DrawerClose
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            className="text-muted-foreground"
          />
        }
      >
        <X />
      </DrawerClose>
    </header>
  );
}

function PullView({ projectId, number }: { projectId: string; number: string }) {
  const loaded = useRequest<PullDetail>(`/projects/${projectId}/pulls/${number}`);

  if (!loaded) return <Loading />;

  if (loaded.data === null) return <Problem text={loaded.error} />;

  const pull = loaded.data;
  const status = TRACKED_STATUS[pull.status];
  return (
    <>
      <Header
        title={pull.title}
        url={pull.url}
        subtitle={`#${pull.number} · ${pull.author ?? "Unknown author"} · ${pull.head} → ${pull.base} · updated ${timeAgo(pull.updatedAt, true)}`}
      />
      <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={status.variant}>{status.label}</Badge>
          <span className="text-muted-foreground">
            {pull.commits} {pull.commits === 1 ? "commit" : "commits"} · {pull.changedFiles}{" "}
            {pull.changedFiles === 1 ? "file" : "files"}
          </span>
          <DiffStat additions={pull.additions} deletions={pull.deletions} />
          {pull.mergeable === false && <Badge variant="destructive">Has conflicts</Badge>}
        </div>
        <Checks checks={pull.checks} />
        <People pull={pull} />
        {pull.body && (
          <section aria-label="Description">
            <Markdown>{pull.body}</Markdown>
          </section>
        )}
        <Files files={pull.files} truncated={pull.filesTruncated} />
      </div>
    </>
  );
}

function CommitView({ projectId, sha }: { projectId: string; sha: string }) {
  const loaded = useRequest<CommitDetail>(`/projects/${projectId}/commits/${sha}`);

  if (!loaded) return <Loading />;

  if (loaded.data === null) return <Problem text={loaded.error} />;

  const commit = loaded.data;
  const [subject = "", ...rest] = commit.message.split("\n");
  const body = rest.join("\n").trim();
  return (
    <>
      <Header
        title={subject || "No message"}
        url={commit.url}
        subtitle={`${commit.sha.slice(0, 7)} · ${commit.author ?? "Unknown author"}${commit.date ? ` · ${timeAgo(commit.date, true)}` : ""}`}
      />
      <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {commit.files.length} {commit.files.length === 1 ? "file" : "files"}
          <DiffStat additions={commit.additions} deletions={commit.deletions} />
          {commit.parents.length > 1 && <Badge variant="outline">Merge</Badge>}
        </div>
        {body && (
          <section aria-label="Message">
            <p className="text-sm whitespace-pre-wrap">{body}</p>
          </section>
        )}
        <Files files={commit.files} truncated={commit.filesTruncated} />
      </div>
    </>
  );
}

const Loading = () => (
  <div className="flex flex-col gap-3 p-5" aria-busy>
    <DrawerTitle className="sr-only">Loading</DrawerTitle>
    <Skeleton className="h-6 w-2/3" />
    <Skeleton className="h-20 w-full" />
    <Skeleton className="h-40 w-full" />
  </div>
);

const Problem = ({ text }: { text: string }) => (
  <div className="p-5">
    <DrawerTitle className="sr-only">Could not read it</DrawerTitle>
    <p className="text-sm text-muted-foreground">Could not read it on GitHub. {text}</p>
  </div>
);

export function CenterDetail({ open, onClose }: { open: Open | undefined; onClose: () => void }) {
  return (
    <Drawer
      open={open !== undefined}
      onOpenChange={(next) => !next && onClose()}
      swipeDirection="right"
    >
      <DrawerContent className="data-[swipe-axis=x]:[--drawer-content-width:100%] data-[swipe-axis=x]:sm:[--drawer-content-width:min(52rem,92vw)]">
        {open?.kind === "pr" && (
          <PullView
            key={`${open.projectId}:${open.what}`}
            projectId={open.projectId}
            number={open.what}
          />
        )}
        {open?.kind === "commit" && (
          <CommitView
            key={`${open.projectId}:${open.what}`}
            projectId={open.projectId}
            sha={open.what}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
