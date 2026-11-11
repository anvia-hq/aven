import type { Available } from "../runtimes/types";
import type { DesktopInfo } from "@aven/protocol/types";

export type DesktopStatus = Available<{
  state: DesktopInfo["state"];
  width: number;
  height: number;
  held: boolean;
  heldByMe: boolean;
  expiresAt?: string;
}>;
