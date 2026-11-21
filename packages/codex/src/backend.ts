import { HostedAgentBackend } from "@aven/agent-backend/hosted-backend";
import { backendMcpTools } from "@aven/agent-backend/mcp";
import { BackendSessions } from "@aven/agent-backend/sessions";
import type {
  BackendUserInput,
  HostedLiveRun,
  HostedOpenOptions,
  HostedRunContext,
  RunInput,
} from "@aven/agent-backend/types";
import { parseCodexAuth } from "@aven/protocol/codex-auth";
import { AGENT_BACKEND_CAPABILITIES, CODEX_TOKEN_MISSING } from "@aven/protocol/runtime-wire";
import { dirname, join } from "node:path";

import { CodexTurn } from "./events";
import { serveCodexMcp } from "./mcp-server";
import { codexSdkQuery, readCodexAuth, removeCodexAuth } from "./sdk";
import type { CodexQuery } from "./types";

const COMPACT_TURN =
  "Compact this conversation. Summarize the objective, the decisions, the files changed and what is left. Reply with one short note that you compacted the thread.";

type CodexLiveRun = HostedLiveRun<CodexTurn> & {
  pending: BackendUserInput[];
  accepting: boolean;
};

export class CodexRuns extends HostedAgentBackend<CodexTurn, CodexLiveRun> {
  readonly kind = "codex" as const;
  readonly capabilities = AGENT_BACKEND_CAPABILITIES.codex;
  protected readonly tokenMissingMessage = CODEX_TOKEN_MISSING;
  protected readonly compactPrompt = COMPACT_TURN;

  private constructor(
    sessions: BackendSessions,
    private readonly query: CodexQuery,
    home: string,
  ) {
    super(sessions, home);
  }

  static open(journalPath: string, query: CodexQuery = codexSdkQuery) {
    return new CodexRuns(
      new BackendSessions(`${journalPath}.codex`, "codex"),
      query,
      dirname(journalPath),
    );
  }

  protected contextOf(input: RunInput) {
    return input.codex;
  }

  protected createLive(
    base: Omit<HostedLiveRun<CodexTurn>, "turn">,
    context: HostedRunContext,
  ): CodexLiveRun {
    return {
      ...base,
      turn: new CodexTurn(context.model, context.redact),
      pending: [],
      accepting: true,
    };
  }

  protected isAcceptingSteer(live: CodexLiveRun) {
    return live.accepting;
  }

  protected override onBeforeCancel(live: CodexLiveRun) {
    live.accepting = false;
  }

  protected override formatError(reason: string) {
    if (reason.includes("Unable to locate Codex CLI")) {
      return "The Codex CLI could not be found. Set CODEX_PATH to the codex executable, or run from an install that includes @openai/codex.";
    }

    return reason;
  }

  protected launch(
    live: CodexLiveRun,
    context: HostedRunContext,
    options: HostedOpenOptions<CodexLiveRun>,
  ) {
    live.pending.push({ text: live.prompt, images: live.images });
    void this.#consume(live, context, options);
  }

  #takePrompt(live: CodexLiveRun) {
    const queued = live.pending.shift();

    if (queued) return queued;

    const taken = live.steers.splice(0);

    if (taken.length === 0) return undefined;

    for (const steer of taken) live.onEvent({ type: "steer_applied", id: steer.id });

    return {
      text: taken.map((steer) => steer.text).join("\n\n"),
      images: taken.flatMap((steer) => steer.images),
    };
  }

  async #consume(
    live: CodexLiveRun,
    context: HostedRunContext,
    options: HostedOpenOptions<CodexLiveRun>,
  ) {
    const prompt = live.prompt;
    const remember = options.rememberSession !== false;
    let token = context.token ?? "";
    const codexHome = join(this.home, "codex", live.threadId);
    const renew = () => {
      const refreshed = readCodexAuth(codexHome);
      const was = parseCodexAuth(token);
      const now = refreshed ? parseCodexAuth(refreshed) : undefined;

      if (!refreshed || !was || !now) return;

      if (
        was.tokens.access_token === now.tokens.access_token &&
        was.tokens.refresh_token === now.tokens.refresh_token
      ) {
        return;
      }

      const previous = token;
      token = refreshed;
      context.renewed?.(refreshed, previous);
    };
    let sessionId = options.sessionId ?? this.sessions.get(live.threadId);
    let savedSessionId: string | undefined;
    let mcp: ReturnType<typeof serveCodexMcp> | undefined;
    try {
      const host = this.createToolHost(live, context);
      mcp = serveCodexMcp(await backendMcpTools(host));
      while (!live.abort.signal.aborted && !live.turn.error) {
        const next = this.#takePrompt(live);

        if (!next) {
          live.accepting = false;
          break;
        }

        live.turn.beginTurn();
        const stream = this.query({
          prompt: next.text,
          images: next.images,
          sessionId,
          token,
          cwd: live.cwd,
          codexHome,
          mcpUrl: mcp.url,
          mcpToken: mcp.token,
          abortController: live.abort,
          tools: host,
          env: context.env,
          redact: context.redact,
          instructions: context.instructions,
          model: context.model,
          effort: context.effort,
          maxTurns: options.maxTurns,
        });
        live.close = stream.close?.bind(stream);
        for await (const event of stream) {
          for (const mapped of live.turn.take(event)) live.onEvent(mapped);

          if (live.turn.sessionId) sessionId = live.turn.sessionId;

          savedSessionId = this.syncSession(live, sessionId, savedSessionId, remember);

          if (live.abort.signal.aborted) break;
        }
        live.close = undefined;
        renew();
      }
      this.settle(live, prompt, remember);
    } catch (error) {
      this.failRun(live, prompt, remember, error);
    } finally {
      live.accepting = false;
      mcp?.close();
      renew();
      removeCodexAuth(codexHome);
      this.cleanupLive(live);
    }
  }
}
