import { atom } from "jotai";

import type { McpServer } from "../types";

export const mcpServersAtom = atom<McpServer[] | null>(null);
