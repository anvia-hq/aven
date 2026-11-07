import type { BotProviderView, ProviderKeyAsk } from "@aven/protocol/providers";
import { providerNeedsKey } from "@aven/protocol/providers";
import type { Provider } from "@aven/protocol/runtime-wire";

import { UnprocessableError } from "../../errors";
import { keylessProviderBody } from "./schema";
import { providersService, type ProviderView } from "./service";

export type BotProviders = {
  list(userId: string): Promise<BotProviderView[]>;
  add(
    userId: string,
    input: {
      kind: Provider;
      name: string;
      baseUrl?: string;
      modelId?: string;
      isDefault?: boolean;
    },
  ): Promise<BotProviderView>;
  update(
    userId: string,
    id: string,
    patch: { name?: string; baseUrl?: string; modelId?: string; isDefault?: true },
  ): Promise<BotProviderView>;
  remove(userId: string, id: string): Promise<void>;
  models(userId: string, id: string): Promise<{ models: string[] }>;
  keyFor(userId: string, id: string): Promise<ProviderKeyAsk>;
};

const seenByBot = ({ id, kind, name, baseUrl, modelId, isDefault, hasKey }: ProviderView) => ({
  id,
  kind,
  name,
  baseUrl,
  modelId,
  isDefault,
  hasKey,
});

const NOT_FOUND = "There is no provider with that id. Use list_providers.";
const MODELS_MAX = 200;

async function find(userId: string, id: string) {
  const found = (await providersService.list(userId)).find((provider) => provider.id === id);
  if (!found) throw new UnprocessableError(NOT_FOUND);
  return found;
}

export const botProviders: BotProviders = {
  async list(userId) {
    return (await providersService.list(userId)).map(seenByBot);
  },

  async add(userId, input) {
    const parsed = keylessProviderBody.safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      throw new UnprocessableError(`${issue.path.join(".") || "provider"}: ${issue.message}`);
    }
    return seenByBot(await providersService.create(userId, parsed.data));
  },

  async update(userId, id, patch) {
    const current = await find(userId, id);
    const moved = patch.baseUrl !== undefined && patch.baseUrl !== current.baseUrl;
    const changed = await providersService.update(userId, id, patch, { dropKey: moved });
    if (!changed) throw new UnprocessableError(NOT_FOUND);
    return seenByBot(changed);
  },

  async remove(userId, id) {
    if (!(await providersService.remove(userId, id))) throw new UnprocessableError(NOT_FOUND);
  },

  async models(userId, id) {
    const provider = await find(userId, id);
    if (providerNeedsKey(provider.kind) && !provider.hasKey) {
      throw new UnprocessableError(`${provider.name} has no key yet. Ask the person for it first.`);
    }
    const listed = await providersService.listModels(userId, id);
    if (!listed) throw new UnprocessableError(NOT_FOUND);
    return { models: listed.models.slice(0, MODELS_MAX) };
  },

  async keyFor(userId, id) {
    const { id: providerId, name } = await find(userId, id);
    return { providerId, name };
  },
};
