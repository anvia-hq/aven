import { featureChoice } from "../../features";

export const CLAUDE_BACKEND_OFF = "The Claude agent is turned off on this server";

export const claudeBackendSetting = (configured: string | undefined) =>
  featureChoice("AVEN_CLAUDE_BACKEND", configured, ["on", "off"], "on") === "on";

export const claudeBackendEnabled = () => claudeBackendSetting(process.env.AVEN_CLAUDE_BACKEND);
