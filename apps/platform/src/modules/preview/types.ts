export type PreviewAnswer = { url: string; embedUrl: string };

export type PreviewSession = PreviewAnswer & { port: number; path: string; key: number };

export type PreviewOffer = { threadId: string; port: number; path: string; nonce: number };

export type PreviewTarget = { runtimeId: string; previewDomain?: string | null };

export type PreviewAddress = { port: number; path: string };
