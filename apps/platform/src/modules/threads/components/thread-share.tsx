import { DRIVING_DAYS_DEFAULT, isDriving } from "@aven/protocol/drivers";
import { CheckIcon, GlobeIcon, LinkIcon, LockIcon, ShareIcon } from "@solar-icons/react/linear";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
    icon: LockIcon,
    title: "Only me",
    detail: "Nobody else can see it.",
  },
  {
    value: "workspace",
    icon: GlobeIcon,
    title: "Everyone in the workspace",
    detail:
      "They can read it, with its files and changes. Only you send messages, unless you turn on multiplayer.",
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
      {shared ? <GlobeIcon /> : <ShareIcon />}
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
      <DialogContent className="sm:max-w-xl">
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Share this thread</DialogTitle>
            <DialogDescription>
              Choose who can read it, and whether teammates can message the agent.
            </DialogDescription>
          </DialogHeader>
          <RadioGroup
            aria-label="Who can see this thread"
            value={thread.visibility}
            onValueChange={(value) => void share(thread, value as ThreadVisibility)}
            className="gap-1.5"
          >
            {CHOICES.map(({ value, icon: Icon, title, detail }) => (
              <Label
                key={value}
                className="cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 font-normal transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-accent"
              >
                <RadioGroupItem value={value} className="mt-0.5" />
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{title}</span>
                  <span className="text-xs text-muted-foreground">{detail}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          {shared && (
            <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <Switch
                aria-label="Let teammates message this thread"
                checked={driving}
                disabled={needsDecisionModel}
                onCheckedChange={(on) => void drive(thread, on ? DRIVING_DAYS_DEFAULT : null)}
                className="mt-0.5"
              />
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium">Multiplayer</span>
                <span className="text-xs text-muted-foreground">
                  {driving
                    ? `Teammates can message, steer and stop the agent until ${new Date(thread.drivingUntil ?? "").toLocaleDateString()}. A message from a teammate runs on their own model and bill, and without your personal variables or MCP servers.`
                    : `Let teammates message the agent for ${DRIVING_DAYS_DEFAULT} days. A message from a teammate runs on their own model and bill.`}
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
                  variant="outline"
                  size="sm"
                  onClick={() => void drive(thread, DRIVING_DAYS_DEFAULT)}
                >
                  Extend
                </Button>
              )}
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => void copyLink()}>
              {copied ? <CheckIcon /> : <LinkIcon />}
              {copied ? "Link copied" : "Copy link"}
            </Button>
            <DialogClose render={<Button type="button" />}>Done</DialogClose>
          </DialogFooter>
          {!shared && (
            <p className="text-xs text-muted-foreground">
              The link opens only for you until you share the thread.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
