import { z } from "zod";

import { ConflictError, UnavailableError } from "../../errors";
import { RuntimeOfflineError, type RuntimeHub, type ViewerSink } from "../runtimes/hub";
import { threadsService } from "../threads/service";
import { desktopControl, desktopInfo } from "./schema";

/** How long a takeover lasts unless the page renews it, so a closed tab gives control back. */
export const TAKEOVER_LEASE_MS = 60_000;

export class SandboxNotRunningError extends ConflictError {
  constructor() {
    super("The thread's sandbox is not running");
  }
}

export class DesktopTakenError extends ConflictError {
  constructor() {
    super("Someone else is controlling the desktop");
  }
}

export type DesktopStatus =
  | { available: false }
  | {
      available: true;
      state: "running" | "stopped" | "starting" | "restarting" | "failed";
      width: number;
      height: number;
      held: boolean;
      /** Whether the caller is the one holding it. Other people's ids are not shown. */
      heldByMe: boolean;
      expiresAt?: string;
    };

// What the runtime answers is parsed; a runtime that sends something else is as good as offline.
function parse<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new UnavailableError("The runtime gave an unexpected answer");
  return parsed.data;
}

// A thread's desktop, watched and driven through the runner that hosts its sandbox (decision
// 0015). Every call starts from a thread of the caller's organization.
export function createDesktopService(hub: RuntimeHub) {
  const connectionFor = async (organizationId: string, threadId: string) => {
    const thread = await threadsService.require(organizationId, threadId);
    const connection = hub.get(thread.runtimeId);
    if (!connection) throw new RuntimeOfflineError();
    return connection;
  };

  // The runtime's own reason stays in the log; the client gets a fixed message.
  const refused = (what: string, error: unknown): never => {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`The desktop ${what} was refused:`, reason);
    if (/locked/i.test(reason)) throw new DesktopTakenError();
    throw new UnavailableError(`The desktop ${what} failed`);
  };

  return {
    async status(organizationId: string, userId: string, threadId: string): Promise<DesktopStatus> {
      const connection = await connectionFor(organizationId, threadId);
      const info = parse(desktopInfo, await connection.call("desktop.status", { threadId }));
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
      const connection = await connectionFor(organizationId, threadId);
      const params = { threadId, holder: userId, leaseMs: TAKEOVER_LEASE_MS };
      const answer = await connection
        .call("desktop.takeover", params)
        .catch((error: unknown) => refused("takeover", error));
      const control = parse(desktopControl, answer);
      if (!control) throw new SandboxNotRunningError();
      return { held: control.held, expiresAt: control.expiresAt };
    },

    async release(organizationId: string, userId: string, threadId: string) {
      const connection = await connectionFor(organizationId, threadId);
      const params = { threadId, holder: userId };
      const answer = await connection
        .call("desktop.release", params)
        .catch((error: unknown) => refused("release", error));
      const control = parse(desktopControl, answer);
      if (!control) throw new SandboxNotRunningError();
      return { held: control.held };
    },

    async openViewer(organizationId: string, threadId: string, sink: ViewerSink) {
      const connection = await connectionFor(organizationId, threadId);
      return connection.openViewer(threadId, sink);
    },
  };
}
