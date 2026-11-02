import type { ProviderKeyAsk } from "@aven/protocol/providers";
import { ArrowUp, Lock } from "@mynaui/icons-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/button";
import { Form } from "@/components/form";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { useProviders } from "@/modules/providers/hooks/use-providers";
import { PROVIDER_LABELS } from "@/modules/providers/types";

// A bot's request for a provider's API key (decision 0086), as a card in the chat: a masked field
// that saves the key to the provider itself, so it reaches neither the chat nor the bot. What it
// says of the provider is read from the person's own list, not from the bot's words, so a bot cannot
// dress the form up as something else. Once saved, the person tells the bot so, as any answer is
// their next message.
export function ProviderKeyForm({
  botName,
  ask,
  onSaved,
}: {
  botName: string;
  ask: ProviderKeyAsk;
  // Tells the bot the key is saved. Resolves to whether the message was taken, like the composer's `onSend`.
  onSaved: (text: string) => boolean | Promise<boolean>;
}) {
  const { providers, loaded, refresh, update } = useProviders();
  const [key, setKey] = useState("");
  const [sending, setSending] = useState(false);
  const provider = providers.find((each) => each.id === ask.providerId);

  // The provider may be one the bot has just made: this card is the first the person hears of it.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function submit() {
    if (!provider || sending || !key.trim()) return;
    setSending(true);
    // The key goes to the person's own provider, and only the fact that it is saved to the bot.
    const saved = await update(provider, { apiKey: key.trim() });
    if (saved) {
      setKey("");
      if (await onSaved(`I saved the API key for ${provider.name}.`)) return;
    }
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
        <div className="flex flex-col gap-2">
          <Label
            htmlFor={`provider-key-${provider.id}`}
            className="text-base leading-6 font-medium"
          >
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
            value={key}
            onChange={(event) => setKey(event.target.value)}
            className="h-9 font-mono"
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {loaded ? "That provider no longer exists." : "Loading the provider…"}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!provider || !key.trim() || sending}>
          <ArrowUp />
          Save key
        </Button>
      </div>
    </Form>
  );
}
