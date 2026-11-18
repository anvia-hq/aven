import { ArrowUp, Lock } from "@mynaui/icons-react";
import { useEffect, useState } from "react";

import { Button } from "@aven/ui/button";
import { Form } from "@aven/ui/form";
import { Input } from "@aven/ui/input";
import { Label } from "@aven/ui/label";
import { useProviders } from "@/modules/providers/hooks/use-providers";
import { PROVIDER_LABELS, type Provider } from "@/modules/providers/types";
import type { ProviderKeyAsk } from "@aven/protocol/types";

export function ProviderKeyForm({
  botName,
  ask,
  onSaved,
}: {
  botName: string;
  ask: ProviderKeyAsk;
  onSaved: (text: string) => boolean | Promise<boolean>;
}) {
  const { providers, loaded, refresh, update } = useProviders();
  const [key, setKey] = useState("");
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(false);
  const provider = providers.find((each) => each.id === ask.providerId);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit() {
    if (!provider || sending || (!saved && !key.trim())) return;

    setSending(true);

    if (!saved) {
      if (!(await update(provider, { apiKey: key.trim() }))) {
        setSending(false);
        return;
      }

      setKey("");
      setSaved(true);
    }

    if (await onSaved(`I saved the API key for ${provider.name}.`)) return;

    setSending(false);
  }

  return (
    <Form
      aria-label={`Enter the API key for ${provider?.name ?? ask.name}`}
      onFormSubmit={() => void submit()}
      className="flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Lock className="size-3.5" />
        <span>{botName} needs an API key. It will not see it.</span>
      </div>

      {provider ? (
        <KeyField
          provider={provider}
          botName={botName}
          saved={saved}
          value={key}
          onChange={setKey}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {loaded ? "That provider no longer exists." : "Loading the provider…"}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!provider || (!saved && !key.trim()) || sending}>
          <ArrowUp />
          {saved ? `Tell ${botName}` : "Save key"}
        </Button>
      </div>
    </Form>
  );
}

function KeyField({
  provider,
  botName,
  saved,
  value,
  onChange,
}: {
  provider: Provider;
  botName: string;
  saved: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  if (saved) {
    return (
      <p className="text-sm text-muted-foreground">
        The key for {provider.name} is saved. {botName} has not been told yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`provider-key-${provider.id}`} className="text-base leading-6 font-medium">
        API key for {provider.name}
      </Label>
      <p className="text-xs text-muted-foreground">
        {PROVIDER_LABELS[provider.kind]}
        {provider.baseUrl ? ` · ${provider.baseUrl}` : ""}
        {provider.hasKey ? " · replaces the saved key" : ""}
      </p>
      <Input
        id={`provider-key-${provider.id}`}
        type="password"
        autoComplete="off"
        aria-label={`API key for ${provider.name}`}
        placeholder="Paste it here"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 font-mono"
      />
    </div>
  );
}
