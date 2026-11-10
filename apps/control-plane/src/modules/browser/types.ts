import type { ViewerHandle, ViewerSink } from "../runtimes/types";

export type BrowserClaims = {
  organizationId: string;
  threadId: string;
  port: number;
};

export type BrowserTokenKind = "ticket" | "page";

export type Header = readonly [name: string, value: string];

export type Head = { start: string; headers: Header[] };

export type BrowserProxyOptions = {
  hostname: string;
  port: number;
  secret: Uint8Array;
  secure: boolean;
  open(claims: BrowserClaims, sink: ViewerSink): Promise<ViewerHandle>;
};

export type BrowserServiceOptions = {
  origin: string | undefined;
  secret: Uint8Array;
  readable(viewer: { organizationId: string; userId: string }, threadId: string): Promise<unknown>;
};
