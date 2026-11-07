import type { McpServerRow } from "@aven/db/schema/types";
import type { BotMcpView, McpConnectResult, RunMcpServer } from "@aven/protocol/types";

export type BotMcp = {
  forRun(userId: string): Promise<RunMcpServer[]>;
  list(userId: string): Promise<BotMcpView[]>;
  add(
    userId: string,
    input: {
      name: string;
      url: string;
      headers?: { name: string; value: string }[];
      target?: BotMcpView["target"];
    },
  ): Promise<BotMcpView>;
  update(
    userId: string,
    id: string,
    patch: {
      name?: string;
      url?: string;
      headers?: { name: string; value: string }[];
      target?: BotMcpView["target"];
      enabled?: boolean;
    },
  ): Promise<BotMcpView>;
  remove(userId: string, id: string): Promise<void>;
  record(results: McpConnectResult[]): Promise<void>;
};

export type McpServerView = Omit<McpServerRow, "headers" | "userId">;
