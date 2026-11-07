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
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { useContinueThread } from "../hooks/use-continue-thread";
import type { Thread } from "../types";

// "Continue on another runner", for the thread's creator (decision 0149): a thread's workspace and
// sandbox stay on the runner it began on, so this starts a new thread on another one, with this
// thread's changes and a summary of what was said. Only runners that are online can take it.
export function ContinueThreadDialog({ thread }: { thread: Thread }) {
  const { runtimes } = useRuntimes();
  const { continueOn, working } = useContinueThread(thread);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  const options = runtimes
    .filter((runtime) => runtime.online && runtime.id !== thread.runtimeId)
    .map((runtime) => ({ value: runtime.id, label: runtime.name }));
  if (options.length === 0) return null;

  async function handleContinue() {
    if (target && (await continueOn(target))) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="xs" className="self-start" />}>
        Continue on another runner
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Continue on another runner?</DialogTitle>
            <DialogDescription>
              A new thread starts on the runner you pick, with this thread's changes (commits and
              uncommitted work) and a summary of the conversation. This thread stays as it is. The
              sandbox, its processes and what was installed in it do not move, and binary files are
              left out of the changes. The agent must not be working.
            </DialogDescription>
          </DialogHeader>
          <Select items={options} value={target} onValueChange={setTarget}>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!target || working || thread.running}
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
