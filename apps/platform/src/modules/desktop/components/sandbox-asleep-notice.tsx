import { Power } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { PanelNotice } from "@/components/panel-notice";
import { Spinner } from "@/components/spinner";

type Props = {
  /** Says it is not running, and when it starts and stops (`Computer.asleep`). */
  asleep: string;
  /** What waking it lets the person do: "You can also wake it up to <purpose>." */
  purpose: string;
  waking: boolean;
  onWake: () => void;
};

// What a panel on a computer (the desktop, a terminal) says while it is not running, with a button
// that starts it.
export function SandboxAsleepNotice({ asleep, purpose, waking, onWake }: Props) {
  return (
    <PanelNotice>
      <span className="flex flex-col items-center gap-4">
        {asleep} You can also wake it up to {purpose}.
        <Button variant="outline" disabled={waking} onClick={onWake}>
          {waking ? <Spinner /> : <Power />} {waking ? "Waking up" : "Wake up"}
        </Button>
      </span>
    </PanelNotice>
  );
}
