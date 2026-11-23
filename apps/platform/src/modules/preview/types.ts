export type PreviewAnswer = { url: string; embedUrl: string };

export type PreviewSession = PreviewAnswer & { port: number; key: number };

export type PreviewOffer = { threadId: string; port: number; nonce: number };

export type PreviewTarget = { runtimeId: string; previewDomain?: string | null };
