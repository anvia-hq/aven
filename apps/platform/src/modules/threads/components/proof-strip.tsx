import {
  IconAlertTriangle,
  IconCheck,
  IconFileDiff,
  IconGitPullRequest,
  IconLoader2,
} from "@tabler/icons-react";
import { cn } from "cn";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { DiffStat } from "@/modules/diff/components/diff-stat";

import type { ThreadPullRequestCheck, TurnProof } from "../types";

function prStatusLabel(pull: ThreadPullRequestCheck) {
  if (pull.checksState === "passing") return "CI passing";

  if (pull.checksState === "failing") {
    return pull.failing.length > 0 ? `CI failing (${pull.failing[0]})` : "CI failing";
  }

  if (pull.checksState === "pending") return "CI running";

  return pull.state;
}

function PrStatusGlyph({ state }: { state: ThreadPullRequestCheck["checksState"] }) {
  if (state === "pending")
    return (
      <IconLoader2
        aria-hidden
        data-icon="inline-start"
        className="animate-spin text-muted-foreground"
      />
    );

  if (state === "passing")
    return <IconCheck aria-hidden data-icon="inline-start" className="text-muted-foreground" />;

  if (state === "failing") return <IconAlertTriangle aria-hidden data-icon="inline-start" />;

  return (
    <IconGitPullRequest aria-hidden data-icon="inline-start" className="text-muted-foreground" />
  );
}

export function ProofStrip({
  proof,
  prChecks = [],
  onOpenChanges,
  animate = false,
}: {
  proof: TurnProof;
  prChecks?: readonly ThreadPullRequestCheck[];
  onOpenChanges?: () => void;
  animate?: boolean;
}) {
  const hasChecks = proof.checks.length > 0;
  const hasFiles = proof.files.length > 0;
  const hasPrs = prChecks.length > 0;

  if (!hasChecks && !hasFiles && !hasPrs) return null;

  const totalAdd = proof.files.reduce((sum, file) => sum + file.additions, 0);
  const totalDel = proof.files.reduce((sum, file) => sum + file.deletions, 0);
  const filesLabel = (
    <>
      <IconFileDiff aria-hidden data-icon="inline-start" className="text-muted-foreground" />
      <span className="tabular-nums">
        {proof.files.length === 1 ? "1 file" : `${proof.files.length} files`}
      </span>
      {(totalAdd > 0 || totalDel > 0) && (
        <span className="font-mono tabular-nums">
          <DiffStat additions={totalAdd} deletions={totalDel} />
        </span>
      )}
    </>
  );

  return (
    <div
      data-role="proof-strip"
      className={cn("flex flex-wrap items-center gap-1.5 pt-1", animate && "timeline-in")}
    >
      {proof.checks.map((check) => (
        <Badge
          key={check.id}
          variant={check.status === "pass" ? "secondary" : "destructive"}
          title={check.detail}
        >
          {check.status === "pass" ? (
            <IconCheck aria-hidden data-icon="inline-start" className="text-muted-foreground" />
          ) : (
            <IconAlertTriangle aria-hidden data-icon="inline-start" />
          )}
          <span>{check.label}</span>
        </Badge>
      ))}
      {hasFiles &&
        (onOpenChanges ? (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            className="h-5 rounded-4xl px-2"
            onClick={onOpenChanges}
          >
            {filesLabel}
          </Button>
        ) : (
          <Badge variant="secondary">{filesLabel}</Badge>
        ))}
      {prChecks.map((pull) => {
        const failing = pull.checksState === "failing";
        return (
          <Badge
            key={pull.number}
            variant={failing ? "destructive" : "secondary"}
            render={<a href={pull.url} target="_blank" rel="noreferrer" />}
          >
            <PrStatusGlyph state={pull.checksState} />
            <span className="tabular-nums">
              PR #{pull.number} · {prStatusLabel(pull)}
            </span>
          </Badge>
        );
      })}
    </div>
  );
}
