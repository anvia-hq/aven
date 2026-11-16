export type CloudSettingsSource = "env" | "platform";

export type CloudSettingsView = {
  provider: "spaces";
  base: string;
  runnerUrl: string;
  keyHint: string;
  source: CloudSettingsSource;
};

export type StoredCloudSettings = {
  base: string;
  runnerUrl: string;
  apiKeyEncrypted: string;
  keyHint: string;
};
