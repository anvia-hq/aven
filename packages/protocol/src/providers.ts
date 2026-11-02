// A person's model providers as a bot manages them (decision 0086). A bot never sees an API key,
// and never gives one: the person types it into a masked card, which saves it to the provider.

import type { Provider } from "./runtime-wire";

/** A provider as a bot reads it: what it is, never its key, only whether it has one. */
export type BotProviderView = {
  id: string;
  kind: Provider;
  name: string;
  baseUrl: string | null;
  modelId: string | null;
  isDefault: boolean;
  hasKey: boolean;
};

/** Whether a provider of this kind cannot run without a key; a server of the person's own may need none. */
export const providerNeedsKey = (kind: Provider) => kind !== "openai-compatible";

/**
 * The question a bot asks to get a provider's key: its card is a masked field, and the answer is
 * saved to the provider, so it is in no message, no transcript and nothing the bot reads.
 */
export type ProviderKeyAsk = { providerId: string; name: string };
