import { ExternalLink, Globe, Refresh } from "@mynaui/icons-react";
import type { ReactNode } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { PanelNotice } from "@/components/panel-notice";
import { SidePanel } from "@/components/side-panel";
import { Skeleton } from "@/components/skeleton";
import { SandboxAsleepNotice } from "@/modules/desktop/components/sandbox-asleep-notice";
import { useDesktopStatus } from "@/modules/desktop/hooks/use-desktop-status";
import { useDesktopWake } from "@/modules/desktop/hooks/use-desktop-wake";
import { sandboxView } from "@/modules/desktop/sandbox-view";
import type { Computer } from "@/modules/desktop/types";

import { useBrowser } from "../hooks/use-browser";

type Props = {
  threadId: string;
  computer: Computer;
  owned: boolean;
  onClose: () => void;
};

const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";

export function BrowserPanel({ threadId, computer, owned, onClose }: Props) {
  return (
    <SidePanel title="Browser" icon={Globe} onClose={onClose}>
      {owned ? (
        <WakeGate computer={computer}>
          <BrowserView threadId={threadId} />
        </WakeGate>
      ) : (
        <BrowserView threadId={threadId} />
      )}
    </SidePanel>
  );
}

function WakeGate({ computer, children }: { computer: Computer; children: ReactNode }) {
  const { status, problem, refresh } = useDesktopStatus(computer);
  const { waking, wake } = useDesktopWake(computer, refresh);
  const view = sandboxView(status, problem);
  if (view === "loading") return <Skeleton className="size-full rounded-none" />;
  if (view === "no-sandbox") {
    return (
      <SandboxAsleepNotice
        asleep={computer.asleep}
        purpose="open a page"
        waking={waking}
        onWake={() => void wake()}
      />
    );
  }
  return children;
}

function BrowserView({ threadId }: { threadId: string }) {
  const { port, setPort, session, opening, open } = useBrowser(threadId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Form
        className="flex shrink-0 items-center gap-2 border-b px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          void open();
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
          onClick={() => void open()}
        >
          <Refresh />
        </Button>
        {session && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open in a new tab"
            title="Open in a new tab"
            render={<a href={session.url} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink />
          </Button>
        )}
      </Form>
      <div className="min-h-0 flex-1">
        {session ? (
          <iframe
            key={session.key}
            title="Browser"
            src={session.url}
            sandbox={SANDBOX}
            referrerPolicy="no-referrer"
            className="size-full border-0 bg-white"
          />
        ) : (
          <PanelNotice>
            Open a page the agent is serving in the sandbox: type the port its server listens on.
          </PanelNotice>
        )}
      </div>
    </div>
  );
}
