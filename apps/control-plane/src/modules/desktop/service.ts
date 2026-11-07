import type { DesktopInfo } from "@aven/protocol/runtime-wire";

import { ConflictError, UnavailableError } from "../../errors";
import { desktopControl, desktopInfo } from "./schema";
import type { DesktopStatus } from "./types";
import type { Refusal, Runner, ViewerSink } from "../runtimes/types";

const TAKEOVER_LEASE_MS = 60_000;

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

const refused = (what: string): Refusal => ({
  logged: `The desktop ${what} was refused:`,
  message: `The desktop ${what} failed`,
  instead: (reason) => (/locked/i.test(reason) ? new DesktopTakenError() : undefined),
});

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

type DesktopOwner = { what: string };

export function createDesktopService(runner: Runner, owner: DesktopOwner) {
  return {
    async status(scope: string, userId: string, threadId: string): Promise<DesktopStatus> {
      const info = await runner.ask(scope, "desktop.status", { threadId }, desktopInfo);
      return info ? statusOf(info, userId) : { available: false };
    },

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
