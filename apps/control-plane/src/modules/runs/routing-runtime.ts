import type { Runtime, RunThread, RuntimeRun } from "./runtime";
import type { ModelConfig } from "@aven/agents/model";

// Sends each run to the runtime its thread's project lives on: a connected one, or the control
// plane's own machine when the thread has none.
export class RoutingRuntime implements Runtime {
  constructor(
    private local: Runtime,
    private remote: Runtime,
  ) {}

  #for(thread: RunThread) {
    return thread.runtimeId ? this.remote : this.local;
  }

  start(input: { thread: RunThread; prompt: string; model?: ModelConfig }): RuntimeRun {
    return this.#for(input.thread).start(input);
  }

  stopJobs(thread: RunThread) {
    return this.#for(thread).stopJobs(thread);
  }

  onJobNotice(listener: (threadId: string, notice: string) => void) {
    const stops = [this.local.onJobNotice(listener), this.remote.onJobNotice(listener)];
    return () => stops.forEach((stop) => stop());
  }

  async dispose() {
    await Promise.all([this.local.dispose(), this.remote.dispose()]);
  }

  killAllNow() {
    this.local.killAllNow();
    this.remote.killAllNow();
  }
}
