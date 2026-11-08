import { ArrowRight } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/tooltip";
import { useRuntime } from "@/modules/runtimes/hooks/use-runtime";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { useContinueThread } from "../hooks/use-continue-thread";
import type { Thread } from "../types";

export function ContinueThreadDialog({ thread }: { thread: Thread }) {
  const [open, setOpen] = useState(false);
  const { runtimes } = useRuntimes({ poll: open });
  const { runtime: current } = useRuntime(thread.runtimeId);
  const { continueOn, working } = useContinueThread(thread);
  const [target, setTarget] = useState<string | null>(null);

  const options = runtimes
    .filter((runtime) => runtime.online && runtime.id !== thread.runtimeId)
    .map((runtime) => ({ value: runtime.id, label: runtime.name }));
  const chosen = options.some((option) => option.value === target) ? target : null;
  if (options.length === 0 && !open) return null;

  async function handleContinue() {
    if (chosen && (await continueOn(chosen))) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next || !working) && setOpen(next)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0"
                  aria-label="Continue on another runner"
                />
              }
            />
          }
        >
          <ArrowRight />
        </TooltipTrigger>
        <TooltipContent>Continue on another runner</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Continue on another runner?</DialogTitle>
            <DialogDescription>
              A new thread starts on the runner you pick, with this thread's changes (commits and
              uncommitted work) and a summary of the conversation. This thread stays as it is. The
              sandbox, its processes and what was installed in it do not move, and binary files are
              left out of the changes.
            </DialogDescription>
          </DialogHeader>
          {current && !current.online && (
            <p role="note" className="text-sm text-muted-foreground">
              {current.name} is offline, so this thread's uncommitted work cannot be read. Only what
              was pushed to its branch can be fetched.
            </p>
          )}
          {thread.running && (
            <p role="note" className="text-sm text-muted-foreground">
              The agent is working on this thread. Stop it first, then continue.
            </p>
          )}
          <Select items={options} value={chosen} onValueChange={setTarget}>
            <SelectTrigger aria-label="Runner">
              <SelectValue placeholder="Choose a runner" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={working}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!chosen || working || thread.running}
              onClick={() => void handleContinue()}
            >
              Continue
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
