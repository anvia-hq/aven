const DEFAULT_DRAIN_SECONDS = 120;

export function shutdownDrainMs(setting: string | undefined) {
  const seconds = setting === undefined || setting.trim() === "" ? Number.NaN : Number(setting);

  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_DRAIN_SECONDS * 1000;

  return seconds * 1000;
}
