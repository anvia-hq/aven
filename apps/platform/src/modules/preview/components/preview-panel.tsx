import { ExternalLink, Globe, Refresh } from "@mynaui/icons-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@aven/ui/alert-dialog";
import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { Input } from "@aven/ui/input";
import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { toast } from "@aven/ui/toast";

import { usePreview } from "../hooks/use-preview";
import { parsePort } from "../port";

type Props = {
  runtimeId: string;
  onClose: () => void;
};

const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";

export function PreviewPanel({ runtimeId, onClose }: Props) {
  const { port, setPort, session, problem, opening, open, openInTab } = usePreview(runtimeId);
  const [asking, setAsking] = useState<number | null>(null);

  function ask() {
    const parsed = parsePort(port);

    if (parsed === null) {
      toast.add({ title: "Enter a port between 1 and 65535", type: "error" });
      return;
    }

    setAsking(parsed);
  }

  function confirm() {
    const target = asking;
    setAsking(null);

    if (target !== null) void open(target);
  }

  return (
    <SidePanel title="Browser" icon={Globe} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col">
        <Form
          className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            ask();
          }}
        >
          <Input
            aria-label="Port"
            inputMode="numeric"
            placeholder="Port, such as 3000"
            value={port}
            onChange={(event) => setPort(event.target.value)}
            className="h-7 flex-1"
          />
          <Button type="submit" size="sm" disabled={opening || port.trim() === ""}>
            Open
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Reload"
            title="Reload"
            disabled={opening || !session}
            onClick={() => session && void open(session.port)}
          >
            <Refresh />
          </Button>
          {session && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Open in a new tab"
              title="Open in a new tab"
              onClick={() => void openInTab(session.port)}
            >
              <ExternalLink />
            </Button>
          )}
        </Form>
        <div className="min-h-0 flex-1">
          {session ? (
            <iframe
              key={session.key}
              title={`Port ${session.port}`}
              src={session.embedUrl}
              sandbox={SANDBOX}
              referrerPolicy="no-referrer"
              className="size-full border-0 bg-white"
            />
          ) : (
            <PanelNotice>
              {problem || "Open a page the runner is serving: type the port its server listens on."}
            </PanelNotice>
          )}
        </div>
      </div>
      <AlertDialog open={asking !== null} onOpenChange={(next) => !next && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open port {asking}?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone allowed to use this runner can open what is on port {asking} of this machine.
              Only open a port you started.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>Open</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidePanel>
  );
}
