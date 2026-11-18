import type { AttachmentUpload, Handoff } from "@/modules/threads/types";
import type { Bot, BotChatMessage, BotChatQuote, ToolArtifact } from "@aven/protocol/types";
import type {
  BufferGeometry,
  Group,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  SphereGeometry,
  Texture,
} from "three";

export type {
  Bot,
  BotAttention,
  BotChatMessage,
  BotChatPeer,
  BotChatQuote,
  BotEvent,
  BotQuestion,
  MessageAttachment,
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
  hasComputer?: boolean;
  runtimeId?: string | null;
};

export type ChatItem =
  | { type: "message"; key: string; message: BotChatMessage }
  | { type: "activity"; key: string; messages: BotChatMessage[] };

export type AvatarSetting = { seed?: string; family?: string; color?: string };

export type Point = { x: number; y: number };

export type Vec3 = { x: number; y: number; z: number };

export type Avatar = {
  family: string;
  color: string;
  delay: number;
};

export type ShapeField = (x: number, y: number, z: number) => number;

export type EyePlacement = { x: number; y: number; gap: number; scale: number };

export type FamilyShape = { name: string; field: ShapeField; eye: EyePlacement };

export type Keyframe = readonly [number, number, number, number];

export type HopPose = { lift: number; width: number; height: number };

export type BotMood = "idle" | "working";

export type BotsWorkingStore = {
  subscribe: (listener: () => void) => () => void;
  snapshot: () => ReadonlySet<string>;
};

export type MentionPart =
  | { type: "text"; text: string }
  | { type: "mention"; bot: Pick<Bot, "id" | "name" | "avatar"> }
  | { type: "thread"; id: string; title: string };

export type BotChatState = {
  messages: BotChatMessage[];
  pending: BotChatMessage[];
  handoffs: Record<string, Handoff>;
  typing: boolean;
  activity: string | null;
  error: string | null;
  send: (text: string, files?: AttachmentUpload[], quote?: BotChatQuote) => Promise<boolean>;
};

export type PendingBotMessage = { id: string; message: BotChatMessage };

export type ArtifactKind = "pdf" | "markdown" | "csv" | "text" | "page" | "image" | "video";

export type ArtifactFile = ToolArtifact & { title: string; messageId: string };

export type ArtifactGroup = { title: string; versions: ArtifactFile[] };

export type ArtifactTextState =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; text: string };

export type MotionInput = { mood: BotMood; pointer: Point | null; reduced: boolean };

export type AvatarMotion = {
  work: number;
  phase: number;
  hopping: boolean;
  holdFor: number;
  hopWeight: number;
  wobble: number;
  open: number;
  gaze: Point;
  saccade: Point;
  saccadeAt: number;
  blinkAt: number;
  blinkT: number;
  rotX: number;
  rotY: number;
  seed: number;
  stagger: number;
  random: () => number;
};

export type AvatarPose = {
  lift: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  eyeOpen: number;
  gazeX: number;
  gazeY: number;
  wobble: number;
};

export type AvatarLook = { family: string; color: string; mood: BotMood; delayMs: number };

export type AvatarHandle = { setMood(mood: BotMood): void; dispose(): void };

export type EyeSpot = { position: Vec3; normal: Vec3; scale: number };

export type BodyBase = {
  geometry: BufferGeometry;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  eyes: EyeSpot[];
};

export type AvatarMaterials = {
  environment: Texture;
  clock: { value: number };
  eye: SphereGeometry;
  white: MeshPhysicalMaterial;
  pupil: MeshPhysicalMaterial;
  glint: MeshBasicMaterial;
};

export type EyeRig = { lid: Group; pupil: Group };

export type AvatarModel = {
  root: Group;
  rig: Group;
  tilt: Group;
  eyes: EyeRig[];
  wobble: { value: number };
  scale: number;
  restY: number;
  dispose(): void;
};
