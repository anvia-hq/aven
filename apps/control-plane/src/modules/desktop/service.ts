import type { DesktopInfo } from "@aven/protocol/runtime-wire";

import { ConflictError, UnavailableError } from "../../errors";
import type { Available, Refusal, Runner } from "../runtimes/ask-runner";
import type { ViewerSink } from "../runtimes/viewer-streams";
import { desktopControl, desktopInfo } from "./schema";

/** How long a takeover lasts unless the page renews it, so a closed tab gives control back. */
const TAKEOVER_LEASE_MS = 60_000;

/** Starting a container boots a whole desktop; the runner itself waits up to 90 seconds for it. */
const WAKE_TIMEOUT_MS = 120_000;

class SandboxNotRunningError extends ConflictError {
  constructor(what: string) {
    super(`${what} is not running`);
  }
}

class DesktopTakenError extends ConflictError {
  constructor() {
    super("Someone else is controlling the desktop");
  }
}

export type DesktopStatus = Available<{
  state: DesktopInfo["state"];
  width: number;
  height: number;
  held: boolean;
  /** Whether the caller is the one holding it. Other people's ids are not shown. */
  heldByMe: boolean;
  expiresAt?: string;
}>;

// A desktop held by someone else is said so; anything else is a fixed message.
const refused = (what: string): Refusal => ({
  logged: `The desktop ${what} was refused:`,
  message: `The desktop ${what} failed`,
  instead: (reason) => (/locked/i.test(reason) ? new DesktopTakenError() : undefined),
});

// Wake-up fails for a reason a person can act on only when the thread has never run.
const wakeRefused: Refusal = {
  logged: "The sandbox wake-up was refused:",
  message: "The sandbox could not be started",
  instead: (reason) =>
    /no workspace/i.test(reason)
      ? new ConflictError(
          "The thread has no workspace yet. Its sandbox starts when the agent first works on it",
        )
      : undefined,
};

function statusOf(info: DesktopInfo, userId: string): DesktopStatus {
  const { control } = info;
  return {
    available: true,
    state: info.state,
    width: info.width,
    height: info.height,
    held: control.held,
    heldByMe: control.holder === userId,
    expiresAt: control.expiresAt,
  };
}

/** What a desktop belongs to, in the words of what a person is told. */
type DesktopOwner = { what: string };

// A desktop, watched and driven through the runner that hosts its sandbox (decision 0015): a
// thread's, or a bot's (decision 0059). `scope` is whose it is, as `runner` finds computers by it.
export function createDesktopService(runner: Runner, owner: DesktopOwner) {
  return {
    // A runner that fails to answer is a server error here, not a refusal.
    async status(scope: string, userId: string, threadId: string): Promise<DesktopStatus> {
      const info = await runner.ask(scope, "desktop.status", { threadId }, desktopInfo);
      return info ? statusOf(info, userId) : { available: false };
    },

    // Starts the thread's sandbox when it is off (decision 0039). The answer is the desktop's status,
    // so the page can show it at once.
    async wake(scope: string, userId: string, threadId: string): Promise<DesktopStatus> {
      const info = await runner.ask(
        scope,
        "desktop.wake",
        { threadId },
        desktopInfo,
        wakeRefused,
        WAKE_TIMEOUT_MS,
      );
      if (!info) throw new UnavailableError("The sandbox could not be started");
      return statusOf(info, userId);
    },

    // The agent's inputs fail while a person holds the desktop, until `release` or the lease runs
    // out; the page renews the lease while it is in control.
    async takeover(scope: string, userId: string, threadId: string) {
      const params = { threadId, holder: userId, leaseMs: TAKEOVER_LEASE_MS };
      const control = await runner.ask(
        scope,
        "desktop.takeover",
        params,
        desktopControl,
        refused("takeover"),
      );
      if (!control) throw new SandboxNotRunningError(owner.what);
      return { held: control.held, expiresAt: control.expiresAt };
    },

    async release(scope: string, userId: string, threadId: string) {
      const params = { threadId, holder: userId };
      const control = await runner.ask(
        scope,
        "desktop.release",
        params,
        desktopControl,
        refused("release"),
      );
      if (!control) throw new SandboxNotRunningError(owner.what);
      return { held: control.held };
    },

    async openViewer(scope: string, threadId: string, sink: ViewerSink) {
      const connection = await runner.connection(scope, threadId);
      return connection.openViewer(threadId, sink);
    },
  };
}
