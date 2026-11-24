import {
  IconAlertTriangle,
  IconCheck,
  IconFileDiff,
  IconGitPullRequest,
  IconLoader2,
} from "@tabler/icons-react";
import { cn } from "cn";

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
    return <IconLoader2 aria-hidden className="size-3.5 animate-spin text-meter" />;

  if (state === "passing") return <IconCheck aria-hidden className="size-3.5" />;

  if (state === "failing") return <IconAlertTriangle aria-hidden className="size-3.5" />;

  return <IconGitPullRequest aria-hidden className="size-3.5" />;
}

export function ProofStrip({
  proof,
  prChecks = [],
  onOpenChanges,
}: {
  proof: TurnProof;
  prChecks?: readonly ThreadPullRequestCheck[];
  onOpenChanges?: () => void;
}) {
  const hasChecks = proof.checks.length > 0;
  const hasFiles = proof.files.length > 0;
  const hasPrs = prChecks.length > 0;

  if (!hasChecks && !hasFiles && !hasPrs) return null;

  const totalAdd = proof.files.reduce((sum, file) => sum + file.additions, 0);
  const totalDel = proof.files.reduce((sum, file) => sum + file.deletions, 0);

  return (
    <div data-role="proof-strip" className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
      {proof.checks.map((check) => (
        <span
          key={check.id}
          title={check.detail}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium",
            check.status === "pass"
              ? "border-success/25 bg-success/8 text-success"
              : "border-destructive/30 bg-destructive/8 text-destructive",
          )}
        >
          {check.status === "pass" ? (
            <IconCheck aria-hidden className="size-3.5" />
          ) : (
            <IconAlertTriangle aria-hidden className="size-3.5" />
          )}
          <span>{check.label}</span>
        </span>
      ))}
      {hasFiles && (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-6 rounded-full px-2.5 font-normal text-muted-foreground hover:text-foreground"
          onClick={onOpenChanges}
          disabled={!onOpenChanges}
        >
          <IconFileDiff aria-hidden className="size-3.5" />
          <span>{proof.files.length === 1 ? "1 file" : `${proof.files.length} files`}</span>
          {(totalAdd > 0 || totalDel > 0) && (
            <span className="font-mono">
              <DiffStat additions={totalAdd} deletions={totalDel} />
            </span>
          )}
        </Button>
      )}
      {prChecks.map((pull) => {
        const passing = pull.checksState === "passing";
        const failing = pull.checksState === "failing";
        return (
          <a
            key={pull.number}
            href={pull.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-medium transition-colors hover:bg-accent/50",
              passing && "border-success/25 bg-success/8 text-success",
              failing && "border-destructive/30 bg-destructive/8 text-destructive",
              !passing && !failing && "border-border text-muted-foreground",
            )}
          >
            <PrStatusGlyph state={pull.checksState} />
            <span>
              PR #{pull.number} · {prStatusLabel(pull)}
            </span>
          </a>
        );
      })}
    </div>
  );
}
