import type { DesktopInfo } from "@aven/protocol/runtime-wire";

import { ConflictError, describeError, UnavailableError } from "../../errors";
import { runnerFor, type Available } from "../runtimes/ask-runner";
import type { RuntimeHub, ViewerSink } from "../runtimes/hub";
import { desktopControl, desktopInfo } from "./schema";

/** How long a takeover lasts unless the page renews it, so a closed tab gives control back. */
const TAKEOVER_LEASE_MS = 60_000;

class SandboxNotRunningError extends ConflictError {
  constructor() {
    super("The thread's sandbox is not running");
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

// The runtime's own reason stays in the log; the client gets a fixed message.
const refused =
  (what: string) =>
  (error: unknown): never => {
    const reason = describeError(error);
    console.warn(`The desktop ${what} was refused:`, reason);
    if (/locked/i.test(reason)) throw new DesktopTakenError();
    throw new UnavailableError(`The desktop ${what} failed`);
  };

// A thread's desktop, watched and driven through the runner that hosts its sandbox (decision
// 0015). Every call starts from a thread of the caller's organization.
export function createDesktopService(hub: RuntimeHub) {
  const runner = runnerFor(hub);

  return {
    // A runner that fails to answer is a server error here, not a refusal.
    async status(organizationId: string, userId: string, threadId: string): Promise<DesktopStatus> {
      const info = await runner.ask(organizationId, "desktop.status", { threadId }, desktopInfo);
      if (!info) return { available: false };
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
    },

    // The agent's inputs fail while a person holds the desktop, until `release` or the lease runs
    // out; the page renews the lease while it is in control.
    async takeover(organizationId: string, userId: string, threadId: string) {
      const params = { threadId, holder: userId, leaseMs: TAKEOVER_LEASE_MS };
      const control = await runner.ask(
        organizationId,
        "desktop.takeover",
        params,
        desktopControl,
        refused("takeover"),
      );
      if (!control) throw new SandboxNotRunningError();
      return { held: control.held, expiresAt: control.expiresAt };
    },

    async release(organizationId: string, userId: string, threadId: string) {
      const params = { threadId, holder: userId };
      const control = await runner.ask(
        organizationId,
        "desktop.release",
        params,
        desktopControl,
        refused("release"),
      );
      if (!control) throw new SandboxNotRunningError();
      return { held: control.held };
    },

    async openViewer(organizationId: string, threadId: string, sink: ViewerSink) {
      const connection = await runner.connection(organizationId, threadId);
      return connection.openViewer(threadId, sink);
    },
  };
}
