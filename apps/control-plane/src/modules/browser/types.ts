export type BrowserClaims = {
  organizationId: string;
  threadId: string;
  port: number;
};

export type BrowserTokenKind = "ticket" | "page";

export type Header = readonly [name: string, value: string];

export type Head = { start: string; headers: Header[] };
