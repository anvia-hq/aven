// The wire between the control plane and a runtime (decision 0008): JSON text frames over one
// WebSocket that the runtime opens. Either side can send a one-way message, or a `call` that the
// other answers with a `reply` carrying the same id. No runtime imports, so any client can bundle it.

import type { MessageAttachment, MessageMention, RunEvent } from "./events";

export type RunThreadInfo = {
  id: string;
  organizationId: string;
};

/** The kinds of model provider, in the order a client lists them. */
export const PROVIDERS = ["openai", "anthropic", "azure", "openai-compatible"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** How a run ended: `response` is a normal finish, `error` means the run threw. */
export type RunOutcome = "response" | "blocked" | "interaction" | "error";

/** How a runtime reaches a model. The key stays on the control plane; the token only works for one run. */
export type RunModel = {
  provider: Provider;
  modelId?: string;
  reasoningEffort?: string;
  effortLevels?: string[];
  /** Tokens the model's context holds, when known; the run reports how much of it is used. */
  contextWindow?: number;
  /** Path on the control plane the model client uses as its API root; the runtime adds its own origin. */
  gatewayPath: string;
  gatewayToken: string;
};

export type Reply = {
  type: "reply";
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
  /** A stable reason for known failures, so the caller can rebuild the right error. */
  code?: string;
};

/** Who may drive a thread's desktop; while a person holds it, the agent's inputs fail. */
export type DesktopControl = {
  held: boolean;
  holder?: string;
  expiresAt?: string;
};

/** Where a thread's desktop is, as the runner sees it. */
export type DesktopInfo = {
  state: "running" | "stopped" | "starting" | "restarting" | "failed";
  width: number;
  height: number;
  control: DesktopControl;
};

/** What the control plane asks of a runner about a thread's desktop (decision 0015). */
export type DesktopCallMethod =
  | "desktop.status"
  | "desktop.takeover"
  | "desktop.release"
  /** Starts the thread's sandbox if it is not running, and answers like `desktop.status` (decision 0039). */
  | "desktop.wake";

/** What the control plane asks of a runner about a thread's changes (decision 0030); params are `{ threadId, scope }`. */
type DiffCallMethod = "diff.get";

/**
 * `turn` is what the thread's latest run changed, `all` everything since its branch left the default
 * branch, and `unshipped` what is not yet on the branch's remote copy, which is what the pull request
 * holds: the same as `all` until the branch has been pushed.
 */
export const DIFF_SCOPES = ["turn", "all", "unshipped"] as const;
export type DiffScope = (typeof DIFF_SCOPES)[number];

/** A thread's changes as a unified patch; `truncated` when the patch was cut to keep it small. */
export type ThreadDiff = {
  patch: string;
  truncated: boolean;
};

/**
 * What the control plane asks of a runner about the files of a thread's workspace: `files.list`
 * and `files.read` take `{ threadId, path }` (decision 0031), `files.search` takes `{ threadId,
 * query }` and answers with the paths of the files that match it (decision 0036).
 */
export type FilesCallMethod = "files.list" | "files.read" | "files.search";

export type FileEntry = { name: string; type: "file" | "directory" };

/** A file read from a workspace; `missing` also covers a path outside it. */
export type FileContent =
  | { kind: "text"; text: string; size: number; truncated: boolean }
  | { kind: "binary"; size: number }
  | { kind: "missing" };

/** What the control plane asks of a runner for an image the agent showed (decision 0033); params are `{ threadId, name }`. */
type ArtifactsCallMethod = "artifacts.read";

/** An image a runner keeps, its bytes in base64; null on the wire when there is no such image. */
export type ArtifactContent = { mediaType: string; data: string };

/** The types of image a runner keeps; SVG is not one, since it can carry script. */
export const ARTIFACT_MEDIA_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

/** The extension a kept image's name ends in, by its type. */
export const ARTIFACT_EXTENSIONS: Record<(typeof ARTIFACT_MEDIA_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** The names a runner gives the images it keeps: a uuid and the extension of its type. */
export const ARTIFACT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|gif|webp)$/;

/** Everything the control plane can `call` a runner for. */
export type RunnerCallMethod =
  | DesktopCallMethod
  | DiffCallMethod
  | FilesCallMethod
  | ArtifactsCallMethod;

/** `holder` and `leaseMs` go with a takeover, `holder` with a release; `force` releases whoever holds it. */
export type DesktopCallParams = {
  threadId: string;
  holder?: string;
  leaseMs?: number;
  force?: boolean;
};

export type DiffGetParams = { threadId: string; scope: DiffScope };

export type FilesCallParams = { threadId: string; path: string };

export type FilesSearchParams = { threadId: string; query: string };

/** The most paths a `files.search` answers with. */
export const FILE_SEARCH_LIMIT = 50;

export type ArtifactsReadParams = { threadId: string; name: string };

/**
 * A file sent with a message, its bytes in base64 (decision 0034). The runner copies it into the
 * sandbox; one with `image` it also keeps as that artifact and shows to the model.
 */
export type RunAttachment = MessageAttachment & { data: string };

/**
 * A skill a run has (decision 0035). The runner fetches the archive with `skills.get` when it
 * has none with this digest: the SHA-256, in hex, of the skill's files and their paths.
 */
export type RunSkill = { name: string; description: string; digest: string };

/**
 * The GitHub account a run acts as (decision 0044): the sender's own token and who they are. The
 * runner signs `gh` and `git` in with it inside the thread's sandbox and keeps it in memory, never
 * in its journal.
 */
export type RunGithub = { token: string; id: number; login: string; name: string | null };

/**
 * An environment variable of the thread's project, given to the commands the agent runs (decision
 * 0045). The runner holds it in memory only, never in a record, the journal or a snapshot, and hides a
 * secret's value from what the agent's tools give back.
 */
export type RunEnvVar = { name: string; value: string; secret?: boolean };

/**
 * What lets the sandbox mint OIDC identity tokens for the run (decision 0049). The credential is
 * worth nothing without the control plane, which holds who the run is and ends the credential with
 * the run; the runner puts it in the thread's container for `aven id-token` and keeps it in memory.
 */
export type RunIdentityCredential = { credential: string };

/** What a skill's digest looks like. */
export const SKILL_DIGEST = /^[0-9a-f]{64}$/;

export type ControlPlaneToRuntime =
  | {
      type: "run.start";
      runId: string;
      thread: RunThreadInfo;
      prompt: string;
      attachments?: RunAttachment[];
      mentions?: MessageMention[];
      skills?: RunSkill[];
      github?: RunGithub;
      env?: RunEnvVar[];
      identity?: RunIdentityCredential;
      model?: RunModel;
    }
  /** Continue a run that suspended on a question: `continuation` is what its `run.end` carried, `response` the user's answers. Both are opaque Anvia values. */
  | {
      type: "run.resume";
      runId: string;
      thread: RunThreadInfo;
      continuation: unknown;
      response: unknown;
      skills?: RunSkill[];
      github?: RunGithub;
      env?: RunEnvVar[];
      identity?: RunIdentityCredential;
      model?: RunModel;
    }
  | { type: "run.cancel"; runId: string; reason: string }
  /** After a reconnect: the control plane still follows this run and has everything up to `after`; send what came later, then carry on. */
  | { type: "run.attach"; runId: string; after: number }
  /** The control plane has the end of this run, or does not follow it: forget it. */
  | { type: "run.ack"; runId: string }
  /** Start streaming the thread's desktop (VNC) as binary frames for `viewerId`. */
  | { type: "desktop.open"; viewerId: string; threadId: string }
  | { type: "desktop.close"; viewerId: string }
  /** Start a shell in the thread's sandbox on a pseudo-terminal of `cols` x `rows`; its bytes travel as binary frames for `viewerId` (decision 0053). */
  | { type: "terminal.open"; viewerId: string; threadId: string; cols: number; rows: number }
  | { type: "terminal.resize"; viewerId: string; cols: number; rows: number }
  | { type: "terminal.close"; viewerId: string }
  | {
      type: "call";
      id: string;
      method: RunnerCallMethod;
      params: unknown;
    }
  | Reply;

export type RuntimeToControlPlane =
  /** `runs` are the runs this runtime still holds, ended ones the control plane has not acknowledged included. */
  | { type: "hello"; version: number; runs: string[] }
  /** Every event and the end of a run are numbered from 1, so a reconnect can say where it stopped. */
  | { type: "run.event"; runId: string; seq: number; event: RunEvent }
  /** The run is over. `error` carries the message when `outcome` is "error"; `continuation` what resumes a run that is "interaction" (it waits for the user's answer). */
  | {
      type: "run.end";
      runId: string;
      seq: number;
      outcome: RunOutcome;
      error?: string;
      continuation?: unknown;
    }
  | { type: "call"; id: string; method: CallMethod; params: unknown }
  /** The viewer is streaming; its bytes follow as binary frames. */
  | { type: "desktop.opened"; viewerId: string }
  /** The viewer ended, or could not start: `reason` says why in words. */
  | { type: "desktop.closed"; viewerId: string; reason: string }
  /** The terminal's shell is running; its bytes follow as binary frames. */
  | { type: "terminal.opened"; viewerId: string }
  /** The shell ended, or could not start: `reason` says why in words. */
  | { type: "terminal.closed"; viewerId: string; reason: string }
  | Reply;

/** The runtime reads and writes the conversation, which the control plane owns. */
export type MemoryCallMethod =
  | "memory.load"
  | "memory.append"
  | "memory.clear"
  | "memory.snapshot"
  | "memory.replacePrefix";

/** The runtime asks how to clone the thread's repository (decision 0013); params are `{ runId }`. */
export type RepoCallMethod = "repo.access";

/** The runtime fetches a skill of the run (decision 0035); params are `{ runId, digest }`. */
export type SkillsCallMethod = "skills.get";

export type CallMethod = MemoryCallMethod | RepoCallMethod | SkillsCallMethod;

/** What a runtime needs to clone a thread's repository. The token is short-lived and read-only. */
export type RepoAccess = {
  cloneUrl: string;
  defaultBranch: string;
  token: string;
};

type RepoAccessParams = { runId: string };

type SkillsGetParams = { runId: string; digest: string };

/** A skill's folder as a `.tar.gz`, in base64. */
type SkillArchive = { data: string };

type MemoryAppendParams = {
  runId: string;
  turn: number;
  /** Messages in Anvia's format, as stored in conversation memory; opaque on the wire. */
  messages: unknown[];
};

/** The calls a runner makes today, by method: what it sends and what the control plane answers. */
export type RuntimeCalls = {
  "repo.access": { params: RepoAccessParams; result: RepoAccess };
  "memory.append": { params: MemoryAppendParams; result: null };
  "skills.get": { params: SkillsGetParams; result: SkillArchive };
};

/** WebSocket close codes the control plane ends a runtime's connection with. */
export const CloseCode = {
  /** The runtime speaks another wire version; it should not reconnect. */
  UnsupportedVersion: 4000,
  /** A newer connection from the same runtime took this one's place. */
  Replaced: 4001,
  /** The runtime was revoked or its token rotated; it should not reconnect. */
  Revoked: 4002,
} as const;

// A viewer's VNC bytes, or a terminal's, travel as binary frames, in both directions: the viewer id as 16 bytes
// followed by the payload. Everything else on the wire is JSON text.
const VIEWER_ID_BYTES = 16;

export function encodeViewerFrame(viewerId: string, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(VIEWER_ID_BYTES + payload.length);
  frame.set(Uint8Array.fromHex(viewerId.replaceAll("-", "")));
  frame.set(payload, VIEWER_ID_BYTES);
  return frame;
}

/** The viewer and bytes in a binary frame, or null when it is too short to carry a viewer id. */
export function decodeViewerFrame(frame: Uint8Array) {
  if (frame.length < VIEWER_ID_BYTES) return null;
  const hex = frame.subarray(0, VIEWER_ID_BYTES).toHex();
  const viewerId = [8, 12, 16, 20].reduceRight(
    (id, at) => `${id.slice(0, at)}-${id.slice(at)}`,
    hex,
  );
  return { viewerId, payload: frame.subarray(VIEWER_ID_BYTES) };
}

// What each version added is in docs/products/0005-runtime-wire-versions.md; add a line there when it goes up.
export const WIRE_VERSION = 21;
