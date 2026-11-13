import type { faces } from "./avatar";
import type { Bot, BotChatMessage } from "@aven/protocol/types";

export type {
  Bot,
  BotChatMessage,
  BotChatPeer,
  BotChatQuote,
  BotEvent,
  BotQuestion,
} from "@aven/protocol/types";

export type BotPatch = {
  name?: string;
  instruction?: string;
  description?: string;
  avatar?: string;
  providerId?: string | null;
  modelId?: string | null;
  reasoningEffort?: string | null;
  compactAfterTokens?: number | null;
  runtimeId?: string | null;
};

export type ChatItem =
  | { type: "message"; key: string; message: BotChatMessage }
  | { type: "activity"; key: string; messages: BotChatMessage[] };

export type AvatarSetting = { seed?: string; family?: string; color?: string };

export type Part =
  | { kind: "circle"; cx: number; cy: number; r: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; r: number }
  | { kind: "path"; d: string }
  | { kind: "polygon"; points: string };

export type Point = { x: number; y: number };

export type Face = (typeof faces)[number];

export type Avatar = {
  family: string;
  color: string;
  face: Face;
  parts: readonly Part[];
  center: Point;
  reach: number;
  delay: number;
};

export type BotMood = "idle" | "working";

export type BotsWorkingStore = {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => ReadonlySet<string>;
};

export type MentionPart =
  | { type: "text"; text: string }
  | { type: "mention"; bot: Pick<Bot, "id" | "name" | "avatar"> }
  | { type: "thread"; id: string; title: string };
