import { Check, Copy, ExternalLink } from "@mynaui/icons-react";
import { CODEX_DEFAULT_MODEL } from "@aven/protocol/providers";
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
import { LabeledSelect } from "@/components/labeled-select";
import { useClipboard } from "@/hooks/use-clipboard";
import { useRuntimes } from "@/modules/runtimes/hooks/use-runtimes";

import { useCodexLogin } from "../hooks/use-codex-login";
import { useProviders } from "../hooks/use-providers";

const CHATGPT_SECURITY = "https://chatgpt.com/#settings/Security";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground">
        {n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">{children}</div>
    </li>
  );
}

function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="w-fit"
      render={<a href={href} target="_blank" rel="noreferrer noopener" />}
    >
      {children} <ExternalLink />
    </Button>
  );
}

export function CodexDialog({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string>();
  const [adding, setAdding] = useState(false);
  const { runtimes, isOwnedByMe } = useRuntimes();
  const { create } = useProviders();
  const { copied, copy } = useClipboard();

  const mine = runtimes.filter(isOwnedByMe);
  const ready = mine.filter((runtime) => runtime.online && runtime.codex);
  const runtimeId = chosen ?? ready[0]?.id;
  const { login, start, cancel } = useCodexLogin(open ? runtimeId : undefined, open);
  const without = mine.filter((runtime) => !ready.includes(runtime));

  async function close(next: boolean) {
    if (!next && login?.state === "waiting") await cancel();
    setOpen(next);
  }

  async function connect() {
    setAdding(true);
    const created = await create({ kind: "codex", name: "Codex", modelId: CODEX_DEFAULT_MODEL });
    setAdding(false);
    if (created) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => void close(next)}>
      <DialogTrigger render={<Button variant="outline" size="xs" />}>{label}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect your ChatGPT subscription</DialogTitle>
          <DialogDescription>
            Sign in on one of your own runners. Your ChatGPT login stays on that machine: Aven never
            receives it, and only you can use it.
          </DialogDescription>
        </DialogHeader>

        {ready.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You need a runner of your own that is online and has Codex installed. Add a runtime in
            Settings, install Codex on its machine and restart the runner.
            {without.length > 0 &&
              ` Not ready: ${without.map((runtime) => runtime.name).join(", ")}.`}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {ready.length > 1 && (
              <LabeledSelect
                label="Runner"
                value={runtimeId ?? ""}
                options={ready.map((runtime) => ({ value: runtime.id, label: runtime.name }))}
                onChange={setChosen}
                disabled={login?.state === "waiting"}
              />
            )}

            {login?.state === "signed-in" && (
              <p className="text-sm">Codex is signed in on this runner.</p>
            )}

            {login?.state === "waiting" && (
              <ol className="flex flex-col gap-4">
                <Step n={1}>
                  <span>Enable device code authorization for Codex.</span>
                  <OpenLink href={CHATGPT_SECURITY}>Open ChatGPT Settings</OpenLink>
                  <span className="text-xs text-muted-foreground">
                    ChatGPT Business or Enterprise: an admin must enable it in workspace
                    permissions.
                  </span>
                </Step>
                {login.url && (
                  <Step n={2}>
                    <span>Open the OpenAI device authorization page.</span>
                    <OpenLink href={login.url}>Open Device Authorization</OpenLink>
                  </Step>
                )}
                {login.code && (
                  <Step n={3}>
                    <span>Enter this code when OpenAI asks for it:</span>
                    <div className="flex items-center gap-2">
                      <code
                        aria-label="Device code"
                        className="rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-widest"
                      >
                        {login.code}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Copy the code"
                        onClick={() => void copy(login.code ?? "")}
                      >
                        {copied ? <Check /> : <Copy />}
                      </Button>
                    </div>
                  </Step>
                )}
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
                  Waiting for approval. Keep this dialog open.
                </li>
              </ol>
            )}

            {(login?.state === "failed" || login?.state === "unavailable") && (
              <p role="alert" className="text-sm text-destructive">
                {login.error ?? "Could not sign in"}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {login?.state === "signed-in" ? (
            <Button type="button" disabled={adding} onClick={() => void connect()}>
              Add Codex
            </Button>
          ) : (
            ready.length > 0 &&
            login?.state !== "waiting" && (
              <Button
                type="button"
                disabled={!login || login.state === "unavailable"}
                onClick={() => void start()}
              >
                Connect ChatGPT
              </Button>
            )
          )}
          {login?.state === "waiting" && (
            <Button type="button" variant="outline" onClick={() => void cancel()}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
