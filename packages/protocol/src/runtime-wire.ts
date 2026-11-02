// The wire between the control plane and a runtime (decision 0008): JSON text frames over one
// WebSocket that the runtime opens. Either side can send a one-way message, or a `call` that the
// other answers with a `reply` carrying the same id. No runtime imports, so any client can bundle it.

import type { BotQuestion } from "./bots";
import type { BotGoalView, GoalAction } from "./goals";
import type { BotScheduleView } from "./schedules";
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

/**
 * What the control plane asks of a runner about the processes the agent left running in a thread's
 * sandbox (decision 0071): `processes.list` takes `{ threadId }`, `processes.stop` and
 * `processes.logs` take `{ threadId, processId }`. None of them starts a sandbox that is not up.
 */
export type ProcessesCallMethod = "processes.list" | "processes.stop" | "processes.logs";

/** A process the agent started in a thread's sandbox, with `start_process` or a command run in the background. */
export type ProcessView = {
  id: string;
  /** What was run, as the agent wrote it: a `sh -c` command shows its script. */
  command: string;
  cwd?: string;
  status: "running" | "exited" | "stopped";
  exitCode?: number;
  /** ISO times. */
  startedAt: string;
  endedAt?: string;
};

/** What a process printed, as the latest of each stream; `truncated` when older output was dropped. */
export type ProcessLogs = { stdout: string; stderr: string; truncated: boolean };

/** Everything the control plane can `call` a runner for. */
export type RunnerCallMethod =
  | DesktopCallMethod
  | DiffCallMethod
  | FilesCallMethod
  | ArtifactsCallMethod
  | ProcessesCallMethod;

/** `holder` and `leaseMs` go with a takeover, `holder` with a release; `force` releases whoever holds it. */
export type DesktopCallParams = {
  /** The thread's id, or a bot's: a bot's computer is the sandbox of its own id (decision 0059). */
  threadId: string;
  holder?: string;
  leaseMs?: number;
  force?: boolean;
  /** For a `desktop.wake`: the id is a bot's, whose computer has no repository to clone. */
  bot?: boolean;
};

export type DiffGetParams = { threadId: string; scope: DiffScope };

export type FilesCallParams = { threadId: string; path: string };

export type FilesSearchParams = { threadId: string; query: string };

/** The most paths a `files.search` answers with. */
export const FILE_SEARCH_LIMIT = 50;

export type ArtifactsReadParams = { threadId: string; name: string };

export type ProcessesCallParams = { threadId: string; processId?: string };

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
 * A remote MCP server a run may use (decision 0085): where it is and what to say to it. The headers
 * are the person's secrets, in the clear: the runner keeps them in memory only, for the run.
 */
export type RunMcpServer = {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  /** Whether the server may be on the runner's own machine or network, which is refused otherwise. */
  allowLocal: boolean;
};

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

/**
 * The bot a runner answers for (decision 0059). Its id names its computer on the runner, the way a
 * thread's id names the thread's.
 */
export type BotReplyInfo = {
  id: string;
  name: string;
  /** How other bots write to this one (decision 0065). */
  handle: string;
  instruction: string;
  /** What the bot is for, as it is now; the bot may change it (decision 0061). */
  description: string;
  /** Tokens past which the bot's chat is summarized; none means 70% of the model's window. */
  compactAfterTokens?: number;
  /** Whether this bot may make others, a power of the person's main bot (decision 0060). */
  canCreateBots: boolean;
  /** The person's other bots, which this one may write to (decision 0065). */
  peers: BotPeer[];
  /** The person's timezone, which the bot's schedules are in unless it says another (decision 0067). */
  timezone: string;
};

/** A bot another bot may write to: how to name it in a call, and what it is for. */
export type BotPeer = { handle: string; name: string; description: string };

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
  /**
   * The person said something to a bot: the runner has the bot's agent answer, on the bot's own
   * computer, and says each message the bot sends with `bot.say` (decision 0059). A reply does not
   * survive a dropped connection.
   */
  | {
      type: "bot.reply";
      replyId: string;
      bot: BotReplyInfo;
      prompt: string;
      model: RunModel;
      /** The files the person sent with the message, which the runner copies to the bot's computer (decision 0080). */
      attachments?: RunAttachment[];
      /** The person's skills and the built-in ones, which the runner puts in the bot's `/skills` (decision 0081). */
      skills?: RunSkill[];
    }
  | { type: "bot.cancel"; replyId: string; reason: string }
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
  /**
   * `runs` are the runs this runtime still holds, ended ones the control plane has not acknowledged
   * included. `build` is the release of the `aven` the runner is, so Settings can say when it is
   * behind the server (decision 0073); a runner that is not a release leaves it out.
   */
  | { type: "hello"; version: number; runs: string[]; build?: string }
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
  /** The bot sent a message, after the pause that makes it look typed; the control plane shows it. */
  | { type: "bot.say"; replyId: string; text: string }
  /** The reply is over; `error` says why when the bot's agent threw. */
  | { type: "bot.end"; replyId: string; error?: string }
  /** The viewer is streaming; its bytes follow as binary frames. */
  | { type: "desktop.opened"; viewerId: string }
  /** The viewer ended, or could not start: `reason` says why in words. */
  | { type: "desktop.closed"; viewerId: string; reason: string }
  /** The terminal's shell is running; its bytes follow as binary frames. */
  | { type: "terminal.opened"; viewerId: string }
  /** The shell ended, or could not start: `reason` says why in words. */
  | { type: "terminal.closed"; viewerId: string; reason: string }
  | Reply;

/** The runtime adds a turn to the transcript, which the control plane owns (decision 0021). */
export type MemoryCallMethod = "memory.append";

/** The runtime asks how to clone the thread's repository (decision 0013); params are `{ runId }`. */
export type RepoCallMethod = "repo.access";

/** The runtime fetches a skill of the run (decision 0035); params are `{ runId, digest }`. */
export type SkillsCallMethod = "skills.get";

/**
 * The runner reads and adds to the bot's conversation, which the control plane keeps (decision 0059):
 * the operations an Anvia memory store has, for the bot of a live reply, less `clear`: a runner
 * cannot wipe a chat. Messages are Anvia's.
 */
export type BotCallMethod =
  | "bot.memory"
  | "bot.create"
  | "bot.update"
  | "bot.send"
  | "bot.question"
  | "bot.schedule"
  | "bot.goal"
  | "bot.skill";

export type CallMethod = MemoryCallMethod | RepoCallMethod | SkillsCallMethod | BotCallMethod;

/** What a runtime needs to clone a thread's repository. The token is short-lived and read-only. */
export type RepoAccess = {
  cloneUrl: string;
  defaultBranch: string;
  token: string;
};

type RepoAccessParams = { runId: string };

type SkillsGetParams = { runId: string; digest: string };

/** A skill's archive for a bot's reply (decision 0081): only one of the skills the reply was given. */
export type BotSkillParams = { replyId: string; digest: string };

/** A skill's folder as a `.tar.gz`, in base64. */
type SkillArchive = { data: string };

type MemoryAppendParams = {
  runId: string;
  turn: number;
  /** Messages in Anvia's format, as stored in conversation memory; opaque on the wire. */
  messages: unknown[];
};

/** What a runner asks of a bot's conversation; `replyId` names the live reply it is working on. */
export type BotMemoryParams = { replyId: string } & (
  | { op: "load" }
  | { op: "append"; runId: string; turn: number; messages: unknown[] }
  /** The conversation as the model sees it now: the latest summary and what came after it. */
  | { op: "snapshot" }
  | {
      op: "replacePrefix";
      runId: string;
      revision: string;
      messageCount: number;
      replacement: unknown;
    }
);

/** What a bot asks for when it makes another (decision 0060); `replyId` names the live reply it is working on. */
export type BotCreateParams = {
  replyId: string;
  name: string;
  /** What the new bot is for and how it works, written to it. */
  instruction: string;
  description?: string;
};

/**
 * What a bot changes about itself (decision 0061); `replyId` names the live reply, whose bot is
 * the one changed. What is left out stays, and at least one is given.
 */
export type BotUpdateParams = {
  replyId: string;
  name?: string;
  description?: string;
  instruction?: string;
};

/** What the bot is now. Its instruction applies from the next message, not the reply that changed it. */
export type BotUpdated = { name: string; description: string };

/**
 * A bot writes to another of the person's bots (decision 0065); `replyId` names the live reply it is
 * working on. The other bot answers later, in a reply of its own, so nothing is waited for.
 */
export type BotSendParams = { replyId: string; to: string; text: string };

/** The bot the message went to. */
export type BotSent = { handle: string; name: string };

/**
 * A bot asks the person to decide (decision 0066); `replyId` names the live reply it is working on.
 * The question is shown to the person in this bot's chat, or, for a bot answering another bot,
 * sent to the main bot to ask.
 */
export type BotQuestionParams = { replyId: string; questions: BotQuestion[] };

/** Where the question went: nothing is set when it is on the person's screen, else the bot that will ask. */
export type BotQuestioned = { relayed?: { handle: string; name: string; text: string } };

/**
 * A bot looks at its schedules, or makes, changes or deletes one (decision 0067); `replyId` names
 * the live reply it is working on. What is left out of an update stays.
 */
export type BotScheduleParams = { replyId: string } & (
  | { op: "list" }
  | {
      op: "create";
      name: string;
      cron: string;
      prompt: string;
      timezone?: string;
      /** The handle of the bot that runs it; the one asking when left out. */
      bot?: string;
    }
  | {
      op: "update";
      id: string;
      name?: string;
      cron?: string;
      prompt?: string;
      timezone?: string;
      enabled?: boolean;
      bot?: string;
    }
  | { op: "delete"; id: string }
);

/** A schedule for `create` and `update`, all of them for `list`, nothing for `delete`. */
export type BotScheduled = BotScheduleView | BotScheduleView[] | null;

/**
 * A bot looks at its goal, starts one, or changes it (decision 0068); `replyId` names the live reply
 * it is working on. The goal is the reply's own bot's, whichever bot the runner might name.
 */
export type BotGoalParams = { replyId: string } & (
  | { op: "get" }
  | { op: "start"; objective: string; checks: string[]; maxRounds?: number }
  | { op: "update"; action: GoalAction; reason?: string }
);

/** The goal as it is now, or null when the bot has none, as after it was cleared. */
export type BotGoaled = BotGoalView | null;

/** The bot that was made. It uses the person's default model until they pick another. */
export type BotCreated = { id: string; name: string; handle: string };

/** The calls a runner makes today, by method: what it sends and what the control plane answers. */
export type RuntimeCalls = {
  /** The answer is Anvia's: messages for `load`, `{ revision, messages }` for `snapshot`, `{ status }` for `replacePrefix`, null for the others. */
  "bot.memory": { params: BotMemoryParams; result: unknown };
  "bot.create": { params: BotCreateParams; result: BotCreated };
  "bot.update": { params: BotUpdateParams; result: BotUpdated };
  "bot.send": { params: BotSendParams; result: BotSent };
  "bot.question": { params: BotQuestionParams; result: BotQuestioned };
  "bot.schedule": { params: BotScheduleParams; result: BotScheduled };
  "bot.goal": { params: BotGoalParams; result: BotGoaled };
  "bot.skill": { params: BotSkillParams; result: SkillArchive };
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

// What each version added is in docs/products/0005-runtime-wire-versions.md; add a line there when it goes up.
export const WIRE_VERSION = 35;
