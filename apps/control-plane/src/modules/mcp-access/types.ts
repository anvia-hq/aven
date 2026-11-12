import type { createBotApi } from "../bot-api/service";
import type { AccessPermission } from "@aven/protocol/types";

export type McpApi = Pick<ReturnType<typeof createBotApi>, "answer">;

export type McpCaller = {
  userId: string;
  tokenId: string;
  permissions: readonly AccessPermission[];
};

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string } };

export type McpServerOptions = { api: McpApi; version: string };
