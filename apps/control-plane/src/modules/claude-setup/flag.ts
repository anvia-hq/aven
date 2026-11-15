export const CLAUDE_BACKEND_OFF = "The Claude agent is turned off on this server";

export function claudeBackendSetting(configured: string | undefined) {
  const value = configured?.trim() || "on";

  if (value === "on") return true;

  if (value === "off") return false;

  throw new Error(`AVEN_CLAUDE_BACKEND must be on or off, got "${value}"`);
}

export const claudeBackendEnabled = () => claudeBackendSetting(process.env.AVEN_CLAUDE_BACKEND);
