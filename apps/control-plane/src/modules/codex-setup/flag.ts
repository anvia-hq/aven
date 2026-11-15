import { featureChoice } from "../../features";

export const CODEX_BACKEND_OFF = "The Codex agent is turned off on this server";

export const codexBackendSetting = (configured: string | undefined) =>
  featureChoice("AVEN_CODEX_BACKEND", configured, ["on", "off"], "on") === "on";

export const codexBackendEnabled = () => codexBackendSetting(process.env.AVEN_CODEX_BACKEND);
