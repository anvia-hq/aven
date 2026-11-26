export type Env = Record<string, string | undefined>;

export type ServiceNames = { launchdLabel: string; systemdUnit: string };

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

export type RunnerSettings = { url: string; token: string; dirs: string[] };

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

export type ProxyRoute = { prefix: string; port: number };

export type PreviewProxyOptions = {
  port: number;
  webPort: number;
  apiPort?: number;
  routes?: readonly ProxyRoute[];
  origin?: string;
  bind?: string;
};

export type PreviewProxyHandle = {
  port: number;
  stop(): void;
};
