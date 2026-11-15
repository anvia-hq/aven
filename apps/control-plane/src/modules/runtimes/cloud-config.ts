export function cloudProvider(configured: string | undefined) {
  const value = configured?.trim() || "off";

  if (value === "off" || value === "boat") return value;

  throw new Error(`AVEN_CLOUD_PROVIDER must be off or boat, got "${value}"`);
}

export const cloudApiKey = () => process.env.AVEN_BOAT_API_KEY?.trim() || null;

export const cloudEnabled = () =>
  cloudProvider(process.env.AVEN_CLOUD_PROVIDER) === "boat" && cloudApiKey() !== null;
