import { HostedAgentBackend } from "@aven/agent-backend/hosted-backend";
import { BackendSessions } from "@aven/agent-backend/sessions";
import type {
  BackendPromptItem,
  HostedLiveRun,
  HostedOpenOptions,
  HostedRunContext,
  RunInput,
} from "@aven/agent-backend/types";
import { CODING_MAX_TURNS } from "@aven/agents/turn-limits";
import { AGENT_BACKEND_CAPABILITIES, CLAUDE_TOKEN_MISSING } from "@aven/protocol/runtime-wire";
import { dirname, join } from "node:path";

import { ClaudeTurn } from "./events";
import { claudeSdkQuery } from "./sdk";
import type { ClaudeQuery } from "./types";

type ClaudeLiveRun = HostedLiveRun<ClaudeTurn> & {
  queue: PromptQueue;
};

export class PromptQueue {
  #pending: BackendPromptItem[] = [];
  #waiters: Array<(result: IteratorResult<BackendPromptItem>) => void> = [];
  #closed = false;

  push(item: BackendPromptItem) {
    if (this.#closed) return false;

    const waiter = this.#waiters.shift();

    if (waiter) waiter({ value: item, done: false });
    else this.#pending.push(item);

    return true;
  }

  get closed() {
    return this.#closed;
  }

  get empty() {
    return this.#pending.length === 0;
  }

  close() {
    if (this.#closed) return;

    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) waiter({ value: undefined, done: true });
  }

  stream(): AsyncIterable<BackendPromptItem> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: (): Promise<IteratorResult<BackendPromptItem>> => {
          const next = this.#pending.shift();

          if (next !== undefined) return Promise.resolve({ value: next, done: false });

          if (this.#closed) return Promise.resolve({ value: undefined, done: true });

          return new Promise((resolve) => this.#waiters.push(resolve));
        },
      }),
    };
  }
}

export class ClaudeRuns extends HostedAgentBackend<ClaudeTurn, ClaudeLiveRun> {
  readonly kind = "claude" as const;
  readonly capabilities = AGENT_BACKEND_CAPABILITIES.claude;
  protected readonly tokenMissingMessage = CLAUDE_TOKEN_MISSING;
  protected readonly compactPrompt = "/compact";

  private constructor(
    sessions: BackendSessions,
    private readonly query: ClaudeQuery,
    home: string,
  ) {
    super(sessions, home);
  }

  static open(journalPath: string, query: ClaudeQuery = claudeSdkQuery) {
    return new ClaudeRuns(
      new BackendSessions(`${journalPath}.claude`, "claude"),
      query,
      dirname(journalPath),
    );
  }

  protected contextOf(input: RunInput) {
    return input.claude;
  }

  protected createLive(
    base: Omit<HostedLiveRun<ClaudeTurn>, "turn">,
    context: HostedRunContext,
  ): ClaudeLiveRun {
    return {
      ...base,
      turn: new ClaudeTurn(context.redact, context.model),
      queue: new PromptQueue(),
    };
  }

  protected isAcceptingSteer(live: ClaudeLiveRun) {
    return !live.queue.closed;
  }

  protected override onBeforeCancel(live: ClaudeLiveRun) {
    live.queue.close();
  }

  protected override onCancel(live: ClaudeLiveRun) {
    live.queue.close();
  }

  protected launch(
    live: ClaudeLiveRun,
    context: HostedRunContext,
    options: HostedOpenOptions<ClaudeLiveRun>,
  ) {
    const host = this.createToolHost(live, context);
    live.queue.push(
      live.images.length > 0 ? { text: live.prompt, images: live.images } : live.prompt,
    );
    const stream = this.query({
      prompt: live.queue.stream(),
      sessionId: options.sessionId ?? this.sessions.get(options.threadId),
      token: context.token ?? "",
      cwd: live.cwd,
      configDir: join(this.home, "claude", options.threadId),
      binaryDir: join(this.home, "claude-code"),
      abortController: live.abort,
      tools: host,
      env: context.env,
      redact: context.redact,
      instructions: context.instructions,
      model: context.model,
      effort: context.effort,
      maxTurns: options.maxTurns ?? CODING_MAX_TURNS,
      resumeInterrupted: options.resumeInterrupted,
    });
    live.close = stream.close?.bind(stream);
    void this.#consume(live, stream, options.rememberSession !== false);
  }

  async #consume(
    live: ClaudeLiveRun,
    stream: AsyncIterable<Parameters<ClaudeTurn["take"]>[0]>,
    remember: boolean,
  ) {
    const prompt = live.prompt;
    let savedSessionId: string | undefined;
    try {
      for await (const message of stream) {
        for (const event of live.turn.take(message)) live.onEvent(event);

        savedSessionId = this.syncSession(live, live.turn.sessionId, savedSessionId, remember);

        if (message.type === "result") {
          const next = live.steers.splice(0);

          if (next.length > 0) {
            for (const steer of next) live.onEvent({ type: "steer_applied", id: steer.id });

            const text = next.map((steer) => steer.text).join("\n\n");
            const images = next.flatMap((steer) => steer.images);
            live.queue.push(images.length > 0 ? { text, images } : text);
          } else if (live.queue.empty) {
            live.queue.close();
          }
        }

        if (live.abort.signal.aborted) break;
      }
      this.settle(live, prompt, remember);
    } catch (error) {
      this.failRun(live, prompt, remember, error);
    } finally {
      live.queue.close();
      this.cleanupLive(live);
    }
  }
}
