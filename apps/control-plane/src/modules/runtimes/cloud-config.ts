import { featureChoice } from "../../features";

export const cloudProvider = (configured: string | undefined) =>
  featureChoice("AVEN_CLOUD_PROVIDER", configured, ["off", "boat"], "off");

export const cloudApiKey = () => process.env.AVEN_BOAT_API_KEY?.trim() || null;

export const cloudEnabled = () =>
  cloudProvider(process.env.AVEN_CLOUD_PROVIDER) === "boat" && cloudApiKey() !== null;
