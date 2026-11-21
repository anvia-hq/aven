export type OpaqueToken = {
  token: string;
  tokenHash: string;
  tokenHint: string;
};

export type Poller = {
  start(): void;
  close(): Promise<void>;
  tick(): Promise<void>;
};

export type ByteRange = { start: number; end: number };
