import { featureList } from "@aven/server-kit/features";

import { boatModule } from "./boat/module";
import { spacesModule } from "./spaces/module";
import { CLOUD_RUNTIME_ID, SPACES_RUNTIME_ID } from "./cloud-id";
import type { CloudProviderModule } from "./types";

export { CLOUD_RUNTIME_ID, SPACES_RUNTIME_ID };

export const CLOUD_OFF = "Aven Cloud is turned off on this server";

const CLOUD_PROVIDERS = {
  boat: { templateId: CLOUD_RUNTIME_ID, module: boatModule },
  spaces: { templateId: SPACES_RUNTIME_ID, module: spacesModule },
} as const;

export type CloudProviderName = keyof typeof CLOUD_PROVIDERS;

const NAMES = Object.keys(CLOUD_PROVIDERS) as CloudProviderName[];

export const CLOUD_TEMPLATE_IDS: string[] = NAMES.map((name) => CLOUD_PROVIDERS[name].templateId);

let offered: CloudProviderName[] = [];

export const offerCloudProviders = (names: CloudProviderName[]) => {
  offered = names;
};

export const cloudProviders = (configured: string | undefined) => {
  const named = featureList("AVEN_CLOUD_PROVIDERS", configured, NAMES);

  return NAMES.filter((name) => named.includes(name) || offered.includes(name));
};

export const enabledCloudProviders = () =>
  cloudProviders(process.env.AVEN_CLOUD_PROVIDERS).filter((name) =>
    CLOUD_PROVIDERS[name].module.ready(),
  );

export const isCloudProvider = (name: string): name is CloudProviderName =>
  NAMES.some((known) => known === name);

export const cloudEnabled = (name: string) =>
  enabledCloudProviders().some((enabled) => enabled === name);

export const templateProvider = (runtimeId: string) =>
  NAMES.find((name) => CLOUD_PROVIDERS[name].templateId === runtimeId);

export const isCloudTemplate = (runtimeId: string) => templateProvider(runtimeId) !== undefined;

export const enabledTemplateIds = (): string[] =>
  enabledCloudProviders().map((name) => CLOUD_PROVIDERS[name].templateId);

export const disabledTemplateIds = () =>
  CLOUD_TEMPLATE_IDS.filter((id) => !enabledTemplateIds().includes(id));

export const cloudTemplateName = (name: string) =>
  enabledCloudProviders().length > 1 ? `Aven Cloud · ${name}` : "Aven Cloud";

export const cloudTemplateId = (name: CloudProviderName) => CLOUD_PROVIDERS[name].templateId;

export const cloudProvider = (name: CloudProviderName): CloudProviderModule =>
  CLOUD_PROVIDERS[name].module;

export const cloudProviderApiKey = (name: string) =>
  isCloudProvider(name) ? CLOUD_PROVIDERS[name].module.apiKey() : null;

export const cloudProviderNames = () => NAMES;

export const cloudSandboxRemover = async (provider: string, sandboxId: string) => {
  if (!isCloudProvider(provider)) return true;

  return CLOUD_PROVIDERS[provider].module.removeSandbox(sandboxId);
};
