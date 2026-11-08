import { Check, Globe, Link, Lock, Share } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { Label } from "@/components/label";
import { RadioGroup, RadioGroupItem } from "@/components/radio-group";
import { toast } from "@/components/toast";

import { useShareThread } from "../hooks/use-share-thread";
import type { Thread, ThreadVisibility } from "../types";

const CHOICES = [
  {
    value: "private",
    icon: Lock,
    title: "Only me",
    detail: "Nobody else can see it.",
  },
  {
    value: "workspace",
    icon: Globe,
    title: "Everyone in the workspace",
    detail: "They can read it, with its files and changes, but not change it.",
  },
] as const;

export function ThreadShare({ thread }: { thread: Thread }) {
  const share = useShareThread();
  const [copied, setCopied] = useState(false);
  const shared = thread.visibility === "workspace";

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
    <Dialog>
      <DialogTrigger
        render={
          <Button
            size="sm"
            className="h-8 md:h-7"
            aria-label={shared ? "Shared to workspace" : "Share"}
          />
        }
      >
        {shared ? <Globe /> : <Share />}
        <span className="hidden sm:inline">{shared ? "Shared to workspace" : "Share"}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Share this thread</DialogTitle>
            <DialogDescription>
              Choose who can read it. Only you can send the agent messages.
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
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={() => void copyLink()}>
              {copied ? <Check /> : <Link />}
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
