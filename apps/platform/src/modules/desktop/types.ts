export type DesktopStatus =
  | { available: false }
  | {
      available: true;
      state: "running" | "stopped" | "starting" | "restarting" | "failed";
      width: number;
      height: number;
      held: boolean;
      heldByMe: boolean;
      expiresAt?: string;
    };
