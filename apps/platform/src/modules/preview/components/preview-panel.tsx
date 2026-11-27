import {
  IconArrowLeft,
  IconArrowRight,
  IconExternalLink,
  IconRefresh,
  IconWorld,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";

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
import { PanelNotice } from "@aven/ui/panel-notice";
import { SidePanel } from "@aven/ui/side-panel";

import type { PreviewAddress, PreviewOffer } from "../types";
import { usePreview } from "../hooks/use-preview";
import { addressOf } from "../port";

type Props = {
  runtimeId: string;
  offer?: PreviewOffer | null;
  onOffered?: () => void;
  onClose: () => void;
};

const SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";

export function PreviewPanel({ runtimeId, offer, onOffered, onClose }: Props) {
  const {
    port,
    setPort,
    previewDomain,
    session,
    currentPath,
    canGoBack,
    canGoForward,
    problem,
    opening,
    iframeRef,
    open,
    navigateInSession,
    reload,
    goBack,
    goForward,
    syncLocation,
    setEditing,
    openInTab,
    parseRequestedAddress,
  } = usePreview(runtimeId);
  const [asking, setAsking] = useState<PreviewAddress | null>(null);
  const target = { runtimeId, previewDomain };

  useEffect(() => {
    if (!offer) return;

    setPort(addressOf(offer.port, { runtimeId, previewDomain }, offer.path));
    setAsking({ port: offer.port, path: offer.path });
    onOffered?.();
  }, [offer, previewDomain, runtimeId]);

  function ask() {
    const parsed = parseRequestedAddress();

    if (parsed === null) return;

    if (session && parsed.port === session.port) {
      navigateInSession(parsed.path);
      return;
    }

    setAsking(parsed);
  }

  function confirm() {
    const requested = asking;
    setAsking(null);

    if (requested === null) return;

    setPort(addressOf(requested.port, target, requested.path));
    void open(requested.port, requested.path);
  }

  return (
    <SidePanel title="Browser" icon={IconWorld} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col">
        <Form
          className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            ask();
          }}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Back"
            title="Back"
            disabled={opening || !session || !canGoBack}
            onClick={goBack}
          >
            <IconArrowLeft />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Forward"
            title="Forward"
            disabled={opening || !session || !canGoForward}
            onClick={goForward}
          >
            <IconArrowRight />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Reload"
            title="Reload"
            disabled={opening || !session}
            onClick={reload}
          >
            <IconRefresh />
          </Button>
          <Input
            aria-label="Address"
            placeholder={
              previewDomain ? `3000 or https://3000-….${previewDomain}` : "localhost:3000"
            }
            value={port}
            onChange={(event) => setPort(event.target.value)}
            onFocus={() => setEditing(true)}
            onBlur={() => setEditing(false)}
            className="h-7 flex-1 text-xs"
          />
          <Button type="submit" size="sm" disabled={opening || port.trim() === ""}>
            Open
          </Button>
          {session && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Open in a new tab"
              title="Open in a new tab"
              onClick={() => void openInTab(session.port, currentPath)}
            >
              <IconExternalLink />
            </Button>
          )}
        </Form>
        <div className="min-h-0 flex-1">
          {session ? (
            <iframe
              ref={iframeRef}
              key={session.key}
              title={`Port ${session.port}`}
              src={session.embedUrl}
              onLoad={syncLocation}
              sandbox={SANDBOX}
              referrerPolicy="no-referrer"
              className="size-full border-0 bg-white"
            />
          ) : (
            <PanelNotice>
              {problem ||
                (previewDomain
                  ? `Open a page the runner is serving: enter a port such as 3000 to view it on *.${previewDomain}.`
                  : "Open a page the runner is serving: type its address, such as localhost:3000.")}
            </PanelNotice>
          )}
        </div>
      </div>
      <AlertDialog open={asking !== null} onOpenChange={(next) => !next && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open port {asking?.port}?</AlertDialogTitle>
            <AlertDialogDescription>
              {asking !== null && previewDomain
                ? `This opens ${addressOf(asking.port, target, asking.path)}. Anyone allowed to use this runner can open what is on port ${asking.port} of this machine. Only open a port you started.`
                : `Anyone allowed to use this runner can open what is on port ${asking?.port} of this machine. Only open a port you started.`}
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
