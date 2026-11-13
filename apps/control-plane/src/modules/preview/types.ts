import type { ViewerHandle, ViewerSink } from "../runtimes/types";

export type PreviewClaims = {
  runtimeId: string;
  port: number;
};

export type PreviewTokenKind = "ticket" | "page" | "embed";

export type Header = readonly [name: string, value: string];

export type Head = { start: string; headers: Header[] };

export type PreviewSettings = {
  domain: string | undefined;
  port: number;
  hostname: string;
  secret: Uint8Array;
};

export type PreviewProxyOptions = {
  hostname: string;
  port: number;
  domain: string;
  secret: Uint8Array;
  open(claims: PreviewClaims, sink: ViewerSink): Promise<ViewerHandle>;
};

export type PreviewServiceOptions = {
  settings: PreviewSettings;
  usable(organizationId: string, userId: string, runtimeId: string): Promise<boolean>;
  online(runtimeId: string): boolean;
  openPort(runtimeId: string, port: number, sink: ViewerSink): ViewerHandle;
  env?: Record<string, string | undefined>;
};
