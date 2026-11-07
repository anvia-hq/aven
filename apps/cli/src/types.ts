export type Args = {
  positionals: string[];
  flags: Record<string, string | true>;
};

export type ServerEnvOptions = {
  origin: string;
  port: number;
  version: string;
  ownerEmail?: string;
  domain?: string;
  httpsPort?: number;
  apiPort?: number;
  bind?: string;
  registration?: "open" | "closed";
};

export type ExposureReport = { ok: boolean; detail: string };

export type RunnerSettings = { url: string; token: string; image: string };

export type ServerPlanInput = {
  port?: string;
  httpsPort?: string;
  apiPort?: string;
  domain?: string;
  origin?: string;
  release: string;
  ownerEmail?: string;
  bind?: string;
};

export type ServiceDefinition = {
  label: string;
  command: string[];
  env: Record<string, string>;
  logFile: string;
};

export type ServiceManager = {
  install(def: ServiceDefinition): Promise<void>;
  uninstall(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<string>;
};
