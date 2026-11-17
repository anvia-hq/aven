import { featureChoice } from "@aven/server-kit/features";

export const lensSetting = (configured: string | undefined) =>
  featureChoice("AVEN_LENS", configured, ["on", "off"], "off") === "on";

export const lensEnabled = () => lensSetting(process.env.AVEN_LENS);
