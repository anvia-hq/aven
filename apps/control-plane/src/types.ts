import type { app } from "./index";
import type { createMemoryStore } from "./memory-store";

export type App = typeof app;

export type ConversationStore = ReturnType<typeof createMemoryStore>;
