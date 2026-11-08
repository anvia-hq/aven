import type { RunWebSearch } from "@aven/protocol/types";

const apiKey = process.env.TAVILY_API_KEY?.trim();

export const webSearchForRun: RunWebSearch | undefined = apiKey ? { apiKey } : undefined;
