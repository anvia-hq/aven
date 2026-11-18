import { catalogVendorOf } from "@aven/protocol/providers";

import { gatewayModel } from "./gateway-info";
import { modelCatalog } from "./model-catalog";
import type { GatewayModel, ModelFacts } from "./types";

export function mergeModelFacts(
  gateway: GatewayModel | null,
  catalog: ModelFacts | null,
): ModelFacts {
  const efforts = gateway?.effortKnown ? gateway : catalog;

  return {
    effortLevels: efforts?.effortLevels ?? null,
    defaultEffort: efforts?.defaultEffort ?? null,
    contextWindow: gateway?.contextWindow ?? catalog?.contextWindow ?? null,
    label: gateway?.label ?? catalog?.label ?? null,
  };
}

export async function compatibleModelFacts(
  source: { kind: "openai-compatible"; baseUrl: string; apiKey?: string },
  modelId: string,
): Promise<ModelFacts> {
  const gateway = await gatewayModel(source.baseUrl, source.apiKey, modelId);
  const vendor = catalogVendorOf(source.baseUrl);
  const catalog = vendor ? await modelCatalog.vendorModel(vendor, modelId) : null;

  return mergeModelFacts(gateway, catalog);
}
