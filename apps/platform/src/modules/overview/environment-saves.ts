import type { ChatMessage } from "@/modules/threads/types";

export function finishedEnvironmentSaves(messages: ChatMessage[]) {
  let finished = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "tool" &&
        part.tool.name === "save_environment" &&
        part.tool.status !== "running"
      ) {
        finished += 1;
      }
    }
  }
  return finished;
}
