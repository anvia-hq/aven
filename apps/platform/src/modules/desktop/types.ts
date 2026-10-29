/** What the control plane says about a thread's desktop (`GET /threads/:id/desktop`). */
export type DesktopStatus =
  | { available: false }
  | {
      available: true;
      state: "running" | "stopped" | "starting" | "restarting" | "failed";
      width: number;
      height: number;
      held: boolean;
      /** Whether this person is the one holding it, as opposed to someone else. */
      heldByMe: boolean;
      expiresAt?: string;
    };
