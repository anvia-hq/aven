import { DRIVING_DAYS_DEFAULT, isDriving } from "@aven/protocol/drivers";
import {
  IconCheck,
  IconCopy,
  IconLock,
  IconShare,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react";
import { Link as RouterLink } from "@tanstack/react-router";

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
import { useClipboard } from "@aven/ui/use-clipboard";

import { useDecisionModelReady } from "@/modules/decision-model/hooks/use-decision-model-ready";

import { useDriveThread } from "../hooks/use-drive-thread";
import { useShareThread } from "../hooks/use-share-thread";
import type { Thread, ThreadVisibility } from "../types";

const CHOICES = [
  {
    value: "private",
    title: "Only me",
    detail: "Nobody else can see it.",
    icon: IconLock,
  },
  {
    value: "workspace",
    title: "Everyone in the workspace",
    detail: "They can read it, with its files and changes. Only you send messages.",
    icon: IconUsers,
  },
] as const;

export function ThreadShareButton({ thread, onClick }: { thread: Thread; onClick: () => void }) {
  const shared = thread.visibility === "workspace";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-9 shrink-0 rounded-full md:size-7"
      aria-label={shared ? "Shared to workspace" : "Share"}
      title={shared ? "Shared to workspace" : "Share"}
      onClick={onClick}
    >
      {shared ? <IconWorld /> : <IconShare />}
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
  const { copied, copy } = useClipboard();
  const shared = thread.visibility === "workspace";
  const decisionModelSet = useDecisionModelReady(shared);
  const needsDecisionModel = !driving && decisionModelSet === false;

  const link = `${window.location.origin}/threads/${thread.id}`;
  const choice = CHOICES.find(({ value }) => value === thread.visibility) ?? CHOICES[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-md">
        <div className="flex min-w-0 flex-col gap-4 p-5">
          <DialogHeader className="min-w-0 pr-8">
            <DialogTitle className="text-base">Share this thread</DialogTitle>
            <DialogDescription className="block min-w-0 truncate">{thread.title}</DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-1.5">
            <RadioGroup
              aria-label="Who can see this thread"
              value={thread.visibility}
              onValueChange={(value) => void share(thread, value as ThreadVisibility)}
              className="gap-0.5"
            >
              {CHOICES.map(({ value, title, icon: Icon }) => (
                <Label
                  key={value}
                  className="group/choice cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 font-normal transition-colors hover:bg-muted/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-data-checked:bg-muted"
                >
                  <RadioGroupItem value={value} className="absolute size-px opacity-0" />
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground group-has-data-checked/choice:bg-foreground group-has-data-checked/choice:text-background">
                    <Icon className="size-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{title}</span>
                  <IconCheck className="size-4 text-foreground opacity-0 group-has-data-checked/choice:opacity-100" />
                </Label>
              ))}
            </RadioGroup>
            <p className="px-3 text-xs text-muted-foreground">{choice.detail}</p>
          </div>
          {shared && (
            <div className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
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
        </div>
        <div className="flex min-w-0 items-center gap-2 border-t border-border px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void copy(link)}
            aria-label={copied ? "Link copied" : "Copy link"}
            className="group/link h-auto min-w-0 max-w-full flex-1 shrink justify-start gap-2 rounded-full bg-muted/60 py-1.5 pr-3 pl-3.5 text-left text-xs font-normal text-muted-foreground hover:bg-muted"
          >
            <span className="min-w-0 flex-1 truncate">{link.replace(/^https?:\/\//, "")}</span>
            {copied ? (
              <IconCheck className="size-3.5 shrink-0 text-foreground" />
            ) : (
              <IconCopy className="size-3.5 shrink-0 group-hover/link:text-foreground" />
            )}
          </Button>
          <DialogClose render={<Button type="button" size="sm" className="rounded-full px-4" />}>
            Done
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
