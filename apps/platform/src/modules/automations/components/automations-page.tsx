import {
  IconBolt,
  IconChevronRight,
  IconClock,
  IconExternalLink,
  IconPlayerPlay,
  IconTrash,
  IconWebhook,
} from "@tabler/icons-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Badge } from "@aven/ui/badge";
import { Button } from "@aven/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@aven/ui/collapsible";
import { PageHeader } from "@aven/ui/page-header";
import { Switch } from "@aven/ui/switch";
import { timeAgo } from "@/lib/format";

import { useAutomations } from "../hooks/use-automations";
import type { Automation, AutomationRun } from "../types";
import { AutomationDialog } from "./automation-dialog";
import { AutomationRunsList } from "./automation-runs-list";

function statusBadge(status: Automation["lastStatus"]) {
  if (status === "running") return <Badge variant="secondary">Running</Badge>;

  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;

  if (status === "done") return <Badge variant="outline">Passed</Badge>;

  return null;
}

function AutomationRow({ automation }: { automation: Automation }) {
  const navigate = useNavigate();
  const { setEnabled, remove, triggerNow, fetchRuns } = useAutomations();
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [triggering, setTriggering] = useState(false);

  async function toggleHistory(next: boolean) {
    setOpen(next);

    if (!next) return;

    setLoadingRuns(true);
    try {
      setRuns(await fetchRuns(automation.id));
    } finally {
      setLoadingRuns(false);
    }
  }

  async function handleRunNow() {
    setTriggering(true);
    try {
      const run = await triggerNow(automation);

      if (run?.threadId) {
        void navigate({ to: "/threads/$threadId", params: { threadId: run.threadId } });
      }
    } finally {
      setTriggering(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {automation.triggerKind === "webhook" ? (
              <IconWebhook aria-hidden className="size-4 text-muted-foreground" />
            ) : (
              <IconClock aria-hidden className="size-4 text-muted-foreground" />
            )}
            <span className="truncate text-sm font-semibold">{automation.name}</span>
            <Badge variant="outline">{automation.projectName}</Badge>
            {statusBadge(automation.lastStatus)}
            {!automation.enabled && <Badge variant="secondary">Paused</Badge>}
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground">{automation.prompt}</p>
          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-xs text-muted-foreground">
            {automation.triggerKind === "webhook" && automation.webhookPath && (
              <span className="font-mono">/api{automation.webhookPath}/…</span>
            )}
            {automation.triggerKind === "schedule" && automation.cron && (
              <span className="font-mono">
                {automation.cron} ({automation.timezone ?? "UTC"})
              </span>
            )}
            <span>
              {automation.lastRunAt
                ? `Last ran ${timeAgo(automation.lastRunAt, true)}`
                : "Never ran"}
            </span>
            {automation.lastThreadId && (
              <Link
                to="/threads/$threadId"
                params={{ threadId: automation.lastThreadId }}
                className="inline-flex items-center gap-1 text-foreground hover:underline"
              >
                <span>Latest thread</span>
                <IconExternalLink aria-hidden className="size-3" />
              </Link>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            disabled={triggering}
            onClick={() => void handleRunNow()}
          >
            <IconPlayerPlay aria-hidden className="size-3.5" />
            <span>{triggering ? "Starting…" : "Run now"}</span>
          </Button>
          <Switch
            size="sm"
            aria-label={`Enable ${automation.name}`}
            checked={automation.enabled}
            onCheckedChange={(enabled) => void setEnabled(automation, enabled)}
          />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${automation.name}`}
            onClick={() => void remove(automation)}
          >
            <IconTrash />
          </Button>
        </div>
      </div>
      <Collapsible open={open} onOpenChange={(next) => void toggleHistory(next)}>
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
          <IconChevronRight
            aria-hidden
            className="size-3.5 transition-transform group-data-[panel-open]:rotate-90"
          />
          <span>Run history</span>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <AutomationRunsList runs={runs} loading={loadingRuns} />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

export function AutomationsPage() {
  const { automations, loaded } = useAutomations();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-8">
      <PageHeader
        title="Automations"
        description="Trigger autonomous coding threads from webhooks or recurring schedules."
        actions={<AutomationDialog />}
      />
      {loaded && automations.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 px-6 py-12 text-center">
          <IconBolt aria-hidden className="size-7 text-muted-foreground" />
          <div className="flex max-w-md flex-col gap-1">
            <p className="text-sm font-medium">No automations yet</p>
            <p className="text-sm text-muted-foreground">
              Connect a webhook (Sentry, Slack, GitHub) or schedule to automatically reproduce bugs,
              patch code, run checks, and open pull requests.
            </p>
          </div>
          <AutomationDialog />
        </div>
      )}
      {loaded && automations.length > 0 && (
        <ul aria-label="Automations" className="flex flex-col gap-3">
          {automations.map((automation) => (
            <AutomationRow key={automation.id} automation={automation} />
          ))}
        </ul>
      )}
    </div>
  );
}
