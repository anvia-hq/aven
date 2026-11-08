import type { faces } from "./avatar";
import type { useBotPanels } from "./hooks/use-bot-panels";
import type { Bot, BotChatMessage } from "@aven/protocol/types";

export type { Bot, BotChatMessage, BotChatPeer, BotEvent, BotQuestion } from "@aven/protocol/types";

export type BotPatch = {
  name?: string;
  instruction?: string;
  description?: string;
  avatar?: string;
  providerId?: string | null;
  modelId?: string | null;
  reasoningEffort?: string | null;
  compactAfterTokens?: number | null;
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

export type BotPanels = ReturnType<typeof useBotPanels>;

export type MentionPart =
  | { type: "text"; text: string }
  | { type: "mention"; bot: Pick<Bot, "id" | "name" | "avatar"> }
  | { type: "thread"; id: string; title: string };
