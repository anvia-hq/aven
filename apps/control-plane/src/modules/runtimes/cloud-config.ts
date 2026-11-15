import { featureList } from "../../features";
import { CLOUD_RUNTIME_ID } from "./cloud-id";

const CLOUD_PROVIDERS = {
  boat: { templateId: CLOUD_RUNTIME_ID, ready: () => cloudApiKey() !== null },
} as const;

type CloudProviderName = keyof typeof CLOUD_PROVIDERS;

const NAMES = Object.keys(CLOUD_PROVIDERS) as CloudProviderName[];

export const CLOUD_TEMPLATE_IDS: string[] = NAMES.map((name) => CLOUD_PROVIDERS[name].templateId);

export const cloudApiKey = () => process.env.AVEN_BOAT_API_KEY?.trim() || null;

export const cloudProviders = (configured: string | undefined) =>
  featureList("AVEN_CLOUD_PROVIDERS", configured, NAMES);

export const enabledCloudProviders = () =>
  cloudProviders(process.env.AVEN_CLOUD_PROVIDERS).filter((name) => CLOUD_PROVIDERS[name].ready());

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
