import { DRIVING_DAYS_DEFAULT, isDriving } from "@aven/protocol/drivers";
import { IconCheck, IconLink, IconShare, IconWorld } from "@tabler/icons-react";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@aven/ui/dialog";
import { Label } from "@aven/ui/label";
import { RadioGroup, RadioGroupItem } from "@aven/ui/radio-group";
import { Switch } from "@aven/ui/switch";
import { toast } from "@aven/ui/toast";

import { useDecisionModelReady } from "@/modules/decision-model/hooks/use-decision-model-ready";

import { useDriveThread } from "../hooks/use-drive-thread";
import { useShareThread } from "../hooks/use-share-thread";
import type { Thread, ThreadVisibility } from "../types";

const CHOICES = [
  {
    value: "private",
    title: "Only me",
    detail: "Nobody else can see it.",
  },
  {
    value: "workspace",
    title: "Everyone in the workspace",
    detail: "They can read it, with its files and changes. Only you send messages.",
  },
] as const;

export function ThreadShareButton({ thread, onClick }: { thread: Thread; onClick: () => void }) {
  const shared = thread.visibility === "workspace";

  return (
    <Button
      size="sm"
      className="h-8 rounded-full px-3 md:h-7"
      aria-label={shared ? "Shared to workspace" : "Share"}
      onClick={onClick}
    >
      {shared ? <IconWorld /> : <IconShare />}
      <span className="hidden sm:inline">{shared ? "Shared to workspace" : "Share"}</span>
    </Button>
  );
}

export function ThreadShare({
  thread,
  open,
  onOpenChange,
}: {
  thread: Thread;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const share = useShareThread();
  const drive = useDriveThread();
  const driving = isDriving(thread.drivingUntil);
  const [copied, setCopied] = useState(false);
  const shared = thread.visibility === "workspace";
  const decisionModelSet = useDecisionModelReady(shared);
  const needsDecisionModel = !driving && decisionModelSet === false;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/threads/${thread.id}`);
    } catch {
      toast.add({ title: "Could not copy the link", type: "error" });
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl p-6 sm:max-w-md">
        <div className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle className="text-base">Share this thread</DialogTitle>
            <DialogDescription className="sr-only">
              Choose who can read it, and whether teammates can message the agent.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            aria-label="Who can see this thread"
            value={thread.visibility}
            onValueChange={(value) => void share(thread, value as ThreadVisibility)}
            className="gap-2"
          >
            {CHOICES.map(({ value, title, detail }) => (
              <Label
                key={value}
                className="cursor-pointer flex-col items-start gap-0.5 rounded-2xl border border-transparent bg-muted/40 px-4 py-3 font-normal transition-colors hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-data-checked:border-primary/60 has-data-checked:bg-primary/10"
              >
                <RadioGroupItem value={value} className="absolute size-px opacity-0" />
                <span className="text-sm font-medium">{title}</span>
                <span className="text-xs text-muted-foreground">{detail}</span>
              </Label>
            ))}
          </RadioGroup>
          {shared && (
            <div className="flex items-center gap-3 rounded-2xl bg-muted/40 px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">Multiplayer</span>
                <span className="text-xs text-muted-foreground">
                  {driving
                    ? `Teammates can message, steer and stop the agent until ${new Date(thread.drivingUntil ?? "").toLocaleDateString()}. A message from a teammate runs on their own model and bill, and without your personal variables or MCP servers.`
                    : `Teammates message the agent for ${DRIVING_DAYS_DEFAULT} days, on their own model and bill.`}
                </span>
                {needsDecisionModel && (
                  <span className="text-xs text-muted-foreground">
                    The workspace needs a decision model first.{" "}
                    <RouterLink to="/settings/decision-model" className="underline">
                      Set it in settings
                    </RouterLink>
                    .
                  </span>
                )}
              </span>
              {driving && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full px-3"
                  onClick={() => void drive(thread, DRIVING_DAYS_DEFAULT)}
                >
                  Extend
                </Button>
              )}
              <Switch
                aria-label="Let teammates message this thread"
                checked={driving}
                disabled={needsDecisionModel}
                onCheckedChange={(on) => void drive(thread, on ? DRIVING_DAYS_DEFAULT : null)}
              />
            </div>
          )}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              className="rounded-full px-4 text-muted-foreground"
              onClick={() => void copyLink()}
            >
              {copied ? <IconCheck /> : <IconLink />}
              {copied ? "Link copied" : "Copy link"}
            </Button>
            <DialogClose render={<Button type="button" className="rounded-full px-5" />}>
              Done
            </DialogClose>
          </div>
          {!shared && (
            <p className="-mt-2 text-xs text-muted-foreground">
              The link opens only for you until you share the thread.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
