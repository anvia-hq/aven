import { Power } from "@mynaui/icons-react";

import { Button } from "@/components/button";
import { PanelNotice } from "@/components/panel-notice";
import { Spinner } from "@/components/spinner";

import { useWorkspaceExists } from "../hooks/use-workspace-exists";
import type { Computer } from "../types";

type Props = {
  computer: Computer;
  purpose: string;
  waking: boolean;
  onWake: () => void;
};

export function SandboxAsleepNotice({ computer, purpose, waking, onWake }: Props) {
  const exists = useWorkspaceExists(computer);
  if (exists === false) {
    return (
      <PanelNotice>
        This thread has no workspace yet, so there is no sandbox to {purpose}. It is made when the
        agent first works on the thread.
      </PanelNotice>
    );
  }
  return (
    <PanelNotice>
      <span className="flex flex-col items-center gap-4">
        {computer.asleep} You can also wake it up to {purpose}.
        <Button variant="outline" disabled={waking || exists === null} onClick={onWake}>
          {waking ? <Spinner /> : <Power />} {waking ? "Waking up" : "Wake up"}
        </Button>
      </span>
    </PanelNotice>
  );
}
