import { useState } from "react";
import { IconCheck, IconCopy, IconQrcode, IconRefresh } from "@tabler/icons-react";

import { Button } from "@aven/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@aven/ui/dialog";
import { Spinner } from "@aven/ui/spinner";

import { useMobilePairing } from "../hooks/use-mobile-pairing";
import { formatCountdown } from "../pairing";
import { QrCode } from "./qr-code";

export function MobileLinkDialog() {
  const [open, setOpen] = useState(false);
  const { pairingUrl, loading, secondsLeft, expired, copied, generate, clear, copyLink } =
    useMobilePairing();

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (next) {
      void generate();
      return;
    }

    clear();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <IconQrcode />
        Link mobile
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sign in on mobile</DialogTitle>
          <DialogDescription>
            Open Aven on iOS and scan this code. Each code works once and expires automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2">
          {loading && !pairingUrl && (
            <div className="flex size-60 items-center justify-center rounded-xl border border-border bg-muted/40">
              <Spinner />
            </div>
          )}
          {pairingUrl && (
            <div className="relative">
              <div className={expired ? "opacity-25 blur-[2px] transition" : "transition"}>
                <QrCode value={pairingUrl} />
              </div>
              {expired && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <span className="rounded-md bg-popover px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border">
                    Code expired
                  </span>
                  <Button size="sm" onClick={() => void generate()} disabled={loading}>
                    <IconRefresh />
                    Generate new code
                  </Button>
                </div>
              )}
            </div>
          )}
          {pairingUrl && !expired && (
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              Expires in {formatCountdown(secondsLeft)}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={!pairingUrl || expired || loading}
            onClick={() => void copyLink()}
          >
            {copied ? <IconCheck /> : <IconCopy />}
            {copied ? "Copied link" : "Copy link"}
          </Button>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void generate()}>
            {loading ? <Spinner /> : <IconRefresh />}
            New code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
