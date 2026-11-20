import type { MachineProvider } from "../types";

export function machinePlace(provider?: MachineProvider) {
  if (provider) {
    return `You work inside an Aven Cloud sandbox, on the ${provider} provider: a fresh machine made for this thread and deleted when the thread is idle, so anything you have not pushed is lost. It is not the person's computer, and only what this sandbox has installed is available to you.`;
  }

  return "You work on the person's own computer, as their user: nothing is fenced around you. The folder and the tools installed on it stay when this thread ends.";
}
