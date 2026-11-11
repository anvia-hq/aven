import type { Available } from "../runtimes/types";
import type { ComputerInfo } from "@aven/protocol/types";

export type ComputerStatus = Available<{ state: ComputerInfo["state"] }>;
