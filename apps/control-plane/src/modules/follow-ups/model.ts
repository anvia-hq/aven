import type { ModelConfig } from "@aven/agents/types";

import { resolveModel } from "../providers/resolve-model";
import { serverSmallModel } from "../providers/server-small-model";
import type { ModelSelection } from "../providers/types";
import type { FollowUpSettings } from "../preferences/types";

export async function followUpModel(
  userId: string,
  settings: FollowUpSettings,
  env: Record<string, string | undefined> = process.env,
): Promise<ModelConfig | null> {
  if (!settings.providerId) return serverSmallModel(env);

  const selection: ModelSelection = { providerId: settings.providerId };

  if (settings.modelId) selection.modelId = settings.modelId;

  return resolveModel(userId, selection);
}
