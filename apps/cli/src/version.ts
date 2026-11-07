declare const AVEN_VERSION: string | undefined;

export const version = typeof AVEN_VERSION === "string" ? AVEN_VERSION : "dev";
