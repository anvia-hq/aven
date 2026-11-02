import { atom } from "jotai";

import type { McpServer } from "../types";

// The signed-in user's MCP servers as last fetched from the API. Null until the first load.
export const mcpServersAtom = atom<McpServer[] | null>(null);
