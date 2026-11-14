import { Check, Copy } from "@mynaui/icons-react";
import { useState } from "react";

import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { useClipboard } from "@/hooks/use-clipboard";
import { SettingsSection } from "@/components/settings-section";
import { TextField } from "@aven/ui/text-field";

import { useClaudeSetup } from "../hooks/use-claude-setup";

const SETUP_COMMAND = "claude setup-token";

function GetToken() {
  const { copied, copy } = useClipboard();

  return (
    <SettingsSection
      title="Get a token"
      description="You need Claude Code installed and a Claude Pro or Max subscription."
    >
      <ol className="flex max-w-xl flex-col gap-5 text-sm">
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            1
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p>Run this in a terminal on your own computer.</p>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-muted py-1.5 pr-1.5 pl-3">
              <code aria-label="Setup command" className="font-mono text-xs">
                $ {SETUP_COMMAND}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void copy(SETUP_COMMAND)}
              >
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            2
          </span>
          <p className="min-w-0 flex-1">
            Sign in to Claude in the browser window that opens. The terminal then prints a token
            that starts with <code className="font-mono text-xs">sk-ant-oat01-</code>.
          </p>
        </li>
        <li className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            3
          </span>
          <p className="min-w-0 flex-1">Copy it and paste it below. It is shown only once.</p>
        </li>
      </ol>
    </SettingsSection>
  );
}

export function ClaudeSetupSection() {
  const { setup, loaded, failed, save, remove } = useClaudeSetup();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  if (failed) return <p className="py-6 text-sm text-muted-foreground">{failed}</p>;

  if (!loaded) return null;

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    const done = await action();
    setBusy(false);

    if (done) setToken("");
  }

  return (
    <>
      {!setup.configured && <GetToken />}
      <SettingsSection
        title="Setup token"
        description="Stored encrypted for you alone and never shared with a workspace. A Claude thread runs with the token of the person who started it."
      >
        <Form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => save(token));
          }}
        >
          <TextField
            label="Claude setup token"
            type="password"
            autoComplete="off"
            value={token}
            placeholder={
              setup.configured ? `Saved, ending in ${setup.hint}` : "Paste a setup token"
            }
            onChange={(event) => setToken(event.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || token.trim() === ""}>
              {setup.configured ? "Replace" : "Save"}
            </Button>
            {setup.configured && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void run(remove)}
              >
                Remove
              </Button>
            )}
          </div>
        </Form>
      </SettingsSection>
      {setup.configured && <GetToken />}
    </>
  );
}
