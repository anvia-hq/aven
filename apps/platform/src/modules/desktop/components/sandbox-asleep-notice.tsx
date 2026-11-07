import { Power } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { PanelNotice } from "@/components/panel-notice";
import { Spinner } from "@/components/spinner";

type Props = {
  asleep: string;
  purpose: string;
  waking: boolean;
  onWake: () => void;
};

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
