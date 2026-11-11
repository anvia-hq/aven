export type ComputerStatus =
  | { available: false }
  | { available: true; state: "asleep" | "waking" | "awake" };

export type Computer = {
  path: string;
  asleep: string;
};
