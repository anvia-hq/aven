import {
  agentMemoryErrors as errors,
  agentMemoryMessages as messages,
  agentMemorySessions as sessions,
} from "@anvia/memory-drizzle";

// Agent memory tables owned by @anvia/memory-drizzle, exposed here so drizzle-kit includes them in
// our migrations. Their names and columns are fixed by the library; do not redefine them.
export const agentMemoryErrors = errors;
export const agentMemoryMessages = messages;
export const agentMemorySessions = sessions;
