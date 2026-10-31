import { Power } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { PanelNotice } from "@/components/panel-notice";
import { Spinner } from "@/components/spinner";

type Props = {
  /** What waking the sandbox lets the person do: "You can also wake it up to <purpose>." */
  purpose: string;
  waking: boolean;
  onWake: () => void;
};

// What a panel on the thread's sandbox (the desktop, a terminal) says while the sandbox is not
// running, with a button that starts it.
export function SandboxAsleepNotice({ purpose, waking, onWake }: Props) {
  return (
    <PanelNotice>
      <span className="flex flex-col items-center gap-4">
        The thread's sandbox is not running. It starts when the agent works on this thread, and
        stops after fifteen idle minutes. You can also wake it up to {purpose}.
        <Button variant="outline" disabled={waking} onClick={onWake}>
          {waking ? <Spinner /> : <Power />} {waking ? "Waking up" : "Wake up"}
        </Button>
      </span>
    </PanelNotice>
  );
}
