import type { AttachmentUpload, Handoff } from "@/modules/threads/types";
import type { Bot, BotChatMessage, BotChatQuote, ToolArtifact } from "@aven/protocol/types";
import type {
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  SphereGeometry,
  Texture,
  TubeGeometry,
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

export type AvatarAccessory =
  | "none"
  | "beanie"
  | "cap"
  | "tophat"
  | "glasses"
  | "shades"
  | "headphones"
  | "sprout"
  | "halo"
  | "bowtie";

export type AvatarSetting = {
  seed?: string;
  family?: string;
  color?: string;
  accessory?: AvatarAccessory;
};

export type Point = { x: number; y: number };

export type Vec3 = { x: number; y: number; z: number };

export type Avatar = {
  family: string;
  color: string;
  accessory: AvatarAccessory;
  delay: number;
};

export type ShapeField = (x: number, y: number, z: number) => number;

export type EyePlacement = { x: number; y: number; gap: number; scale: number };

export type MouthPlacement = { x: number; y: number; scale: number };

export type FamilyShape = {
  name: string;
  field: ShapeField;
  eye: EyePlacement;
  mouth: MouthPlacement;
};

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
  arrived: ReadonlySet<string>;
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

export type MotionInput = {
  mood: BotMood;
  pointer: Point | null;
  reduced: boolean;
  steady?: boolean;
};

export type AvatarMotion = {
  family: string;
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
  mouthOpen: number;
  accessoryBob: number;
  accessoryTilt: number;
};

export type AvatarLook = {
  family: string;
  color: string;
  accessory?: AvatarAccessory;
  mood: BotMood;
  delayMs: number;
  follow?: boolean;
  steady?: boolean;
};

export type AvatarHandle = {
  setMood(mood: BotMood): void;
  setOptions(options: { follow: boolean; steady: boolean }): void;
  dispose(): void;
};

export type EyeSpot = { position: Vec3; normal: Vec3; scale: number };

export type SurfaceSpot = { position: Vec3; normal: Vec3; scale: number };

export type BodyBase = {
  geometry: BufferGeometry;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  eyes: EyeSpot[];
  mouth: SurfaceSpot;
  top: Vec3;
  left: Vec3;
  right: Vec3;
  chin: SurfaceSpot;
};

export type AvatarMaterials = {
  environment: Texture;
  clock: { value: number };
  wobble: { value: number };
  body: MeshPhysicalMaterial;
  eye: SphereGeometry;
  glintGeo: SphereGeometry;
  smile: TubeGeometry;
  white: MeshPhysicalMaterial;
  pupil: MeshPhysicalMaterial;
  tongue: MeshPhysicalMaterial;
  glint: MeshBasicMaterial;
  accessories: Map<string, MeshPhysicalMaterial>;
};

export type EyeRig = { lid: Group; pupil: Group };

export type MouthRig = { group: Group; smile: Mesh; open: Group };

export type AccessoryRig = {
  root: Group;
  sway?: Group;
  float?: Group;
  dispose(): void;
};

export type AvatarModel = {
  root: Group;
  rig: Group;
  tilt: Group;
  eyes: EyeRig[];
  mouth: MouthRig;
  accessory: AccessoryRig | null;
  wobble: number;
  scale: number;
  restY: number;
  dispose(): void;
};
