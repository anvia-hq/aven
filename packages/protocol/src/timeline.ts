import type {
  ChatMessage,
  LiveStep,
  MessagePart,
  PlanTask,
  ProofCheck,
  ProofFile,
  TimelineEntryInput,
  TimelineIcon,
  TimelineItem,
  TimelineOutcome,
  TimelineStat,
  TimelineTone,
  ToolNarration,
  ToolPart,
  TurnProof,
} from "./types";

const EXPLORE_TOOLS = new Set(["read_file", "grep", "find", "glob", "list_files"]);

const EDIT_TOOLS = new Set(["edit", "write_file", "apply_patch"]);

const COMMAND_TOOLS = new Set(["exec_command", "start_process"]);

const PROCESS_TOOLS = new Set([
  "list_processes",
  "read_process_logs",
  "stop_process",
  "wait_for_process",
  "wait_for_port",
  "list_ports",
]);

const TEST_CMD =
  /\b(bun\s+test|vitest|jest|pytest|cargo\s+test|go\s+test|swift\s+test|playwright\s+test|npm\s+(run\s+)?test|pnpm\s+(run\s+)?test|yarn\s+test|rspec|phpunit)\b/i;

const TYPECHECK_CMD = /\b(typecheck|tsc\b|bun\s+check|mypy|pyright|cargo\s+check)\b/i;

const LINT_CMD =
  /\b(oxlint|eslint|bun\s+run\s+lint|bun\s+lint|biome|ruff|clippy|format:check|bun\s+fmt)\b/i;

const BUILD_CMD =
  /\b((bun|npm|pnpm|yarn)\s+(run\s+)?build|vite\s+build|cargo\s+build|swift\s+build|next\s+build)\b/i;

const BROWSER_CMD =
  /\b(playwright|puppeteer|chromium|headless|curl\s+https?:\/\/(localhost|127\.0\.0\.1))\b/i;

const GH_PR_CREATE = /\bgh\s+pr\s+create\b/i;

const GH_PR_CHECKS = /\bgh\s+pr\s+checks\b|\bgh\s+run\s+(view|watch|list)\b/i;

const GIT_PUSH = /\bgit\s+push\b/i;

const GIT_COMMIT = /\bgit\s+commit\b/i;

const GIT_FETCH = /\bgit\s+(fetch|pull|merge|rebase)\b/i;

function shortPath(path: string) {
  const cleaned = path.replace(/^\/workspace\//, "").replace(/^\.\//, "");
  const parts = cleaned.split("/").filter(Boolean);

  if (parts.length <= 2) return cleaned || path;

  return parts.slice(-2).join("/");
}

function clipLine(text: string, max = 90) {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function diffStatOf(tool: ToolPart): TimelineStat | undefined {
  if (!tool.diff || tool.diff.length === 0) return undefined;

  let additions = 0;
  let deletions = 0;
  for (const line of tool.diff) {
    if (line.type === "add") additions += 1;
    else if (line.type === "del") deletions += 1;
  }
  return { additions, deletions };
}

function mergeStats(left?: TimelineStat, right?: TimelineStat): TimelineStat | undefined {
  if (!left) return right;

  if (!right) return left;

  return {
    additions: left.additions + right.additions,
    deletions: left.deletions + right.deletions,
  };
}

function extractErrorLine(output: string | undefined): string | undefined {
  if (!output) return undefined;

  const lines = output.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    return trimmed ? [trimmed] : [];
  });
  const errorLine = lines.find((line) =>
    /^(Uncaught\s+\w*Error|TypeError|ReferenceError|SyntaxError|RangeError|AssertionError|Error:|FAIL\b|error\s+TS\d+)/i.test(
      line,
    ),
  );

  if (errorLine) return clipLine(errorLine);

  const nonExit = lines.filter((line) => !/^\[exit\s+\d+\]$/.test(line));
  const last = nonExit.at(-1);
  return last ? clipLine(last) : undefined;
}

function parseTestOutcome(output: string | undefined, failed: boolean): TimelineOutcome {
  const text = output ?? "";
  const passMatch =
    text.match(/(\d+)\s+pass(?:ed)?\b/i) ??
    text.match(/Tests?\s+(\d+)\s+passed/i) ??
    text.match(/(\d+)\s+passing/i);
  const failMatch = text.match(/(\d+)\s+fail(?:ed|ing)?\b/i);
  const passed = passMatch ? Number.parseInt(passMatch[1]!, 10) : null;
  const failedCount = failMatch ? Number.parseInt(failMatch[1]!, 10) : null;

  if (!failed) {
    if (passed !== null) {
      const total = passed + (failedCount ?? 0);
      return {
        icon: "check",
        label: total === passed ? `${passed}/${total} passed` : `${passed} passed`,
        tone: "success",
      };
    }

    return { icon: "check", label: "Tests passed", tone: "success" };
  }

  if (failedCount !== null && failedCount > 0) {
    const suffix = passed !== null ? ` (${passed} passed)` : "";
    return { icon: "warning", label: `${failedCount} failed${suffix}`, tone: "error" };
  }

  return { icon: "warning", label: extractErrorLine(output) ?? "Tests failed", tone: "error" };
}

function parsePrNumber(output: string | undefined): string | undefined {
  if (!output) return undefined;

  const match = output.match(/\/pull\/(\d+)/) ?? output.match(/#(\d+)/);
  return match?.[1];
}

function classifyCheckCommand(
  running: boolean,
  failed: boolean,
  output: string | undefined,
  runningIcon: TimelineIcon,
  runningLabel: string,
  okLabel: string,
  failLabel: string,
): { icon: TimelineIcon; label: string; detail?: string; tone: TimelineTone } {
  if (running) return { icon: runningIcon, label: runningLabel, tone: "muted" };

  if (failed) {
    return {
      icon: "warning",
      label: failLabel,
      detail: extractErrorLine(output),
      tone: "error",
    };
  }

  return { icon: "check", label: okLabel, tone: "success" };
}

function prCreateLabel(number: string | undefined, running: boolean) {
  if (number) return `Opened PR #${number}`;

  return running ? "Opening pull request" : "Opened pull request";
}

function classifyCommand(tool: ToolPart): {
  icon: TimelineIcon;
  label: string;
  detail?: string;
  tone: TimelineTone;
} {
  const cmd = tool.target.trim();
  const running = tool.status === "running";
  const failed = tool.status === "error";

  if (TEST_CMD.test(cmd)) {
    if (running) return { icon: "test", label: "Running tests", tone: "muted" };

    const outcome = parseTestOutcome(tool.output, failed);
    const errorDetail = failed ? extractErrorLine(tool.output) : undefined;
    return {
      icon: outcome.icon,
      label: outcome.label,
      detail: errorDetail && errorDetail !== outcome.label ? errorDetail : undefined,
      tone: outcome.tone,
    };
  }

  if (TYPECHECK_CMD.test(cmd)) {
    return classifyCheckCommand(
      running,
      failed,
      tool.output,
      "code",
      "Checking types",
      "Typecheck clean",
      "Typecheck failed",
    );
  }

  if (LINT_CMD.test(cmd)) {
    return classifyCheckCommand(
      running,
      failed,
      tool.output,
      "code",
      "Checking lint",
      "Lint clean",
      "Lint issues found",
    );
  }

  if (BUILD_CMD.test(cmd)) {
    return classifyCheckCommand(
      running,
      failed,
      tool.output,
      "test",
      "Building project",
      "Build succeeded",
      "Build failed",
    );
  }

  if (GH_PR_CREATE.test(cmd)) {
    const number = parsePrNumber(tool.output);
    return {
      icon: failed ? "warning" : "pr",
      label: prCreateLabel(number, running),
      detail: failed ? (extractErrorLine(tool.output) ?? "Could not open PR") : undefined,
      tone: failed ? "error" : "muted",
    };
  }

  if (GH_PR_CHECKS.test(cmd)) {
    const output = tool.output ?? "";
    const checksFail = failed || /\bfail\b|\berror\b/i.test(output);
    const checksPass = !checksFail && /\bpass\b|\bsuccess\b/i.test(output);

    if (!running && checksPass) return { icon: "check", label: "CI passing", tone: "success" };

    if (!running && checksFail) return { icon: "warning", label: "CI failing", tone: "error" };

    return {
      icon: "pr",
      label: running ? "Checking CI status" : "Checked CI status",
      tone: "muted",
    };
  }

  if (BROWSER_CMD.test(cmd)) {
    return {
      icon: failed ? "warning" : "browser",
      label: running ? "Verifying in browser" : "Verified in browser",
      detail: failed ? (extractErrorLine(tool.output) ?? "Verification failed") : undefined,
      tone: failed ? "error" : "muted",
    };
  }

  if (GIT_PUSH.test(cmd)) {
    return {
      icon: failed ? "warning" : "git",
      label: running ? "Pushing branch" : "Pushed branch",
      detail: failed ? (extractErrorLine(tool.output) ?? "Push failed") : undefined,
      tone: failed ? "error" : "muted",
    };
  }

  if (GIT_COMMIT.test(cmd)) {
    return {
      icon: failed ? "warning" : "git",
      label: running ? "Committing changes" : "Committed changes",
      detail: failed ? (extractErrorLine(tool.output) ?? "Commit failed") : undefined,
      tone: failed ? "error" : "muted",
    };
  }

  if (GIT_FETCH.test(cmd)) {
    return {
      icon: failed ? "warning" : "git",
      label: running ? "Syncing git history" : "Synced git history",
      detail: failed ? extractErrorLine(tool.output) : undefined,
      tone: failed ? "error" : "muted",
    };
  }

  const label = tool.name === "start_process" ? "Starting process" : "Running command";
  const failedDetail = failed ? (extractErrorLine(tool.output) ?? "Command failed") : undefined;
  return {
    icon: failed ? "warning" : "terminal",
    label: running ? label : clipLine(cmd, 64) || "Ran command",
    detail: running ? clipLine(cmd, 64) : failedDetail,
    tone: failed ? "error" : "muted",
  };
}

function editVerb(name: string, running: boolean) {
  if (name === "write_file") return running ? "Writing" : "Wrote";

  return running ? "Patching" : "Patched";
}

function computerLabel(name: string, running: boolean) {
  if (name === "computer_wake") return running ? "Waking computer" : "Woke computer";

  return running ? "Checking computer" : "Checked computer";
}

function planStatusOf(mark: string): PlanTask["status"] {
  if (mark === "x") return "completed";

  if (mark === "~") return "in_progress";

  return "pending";
}

function classifySingleTool(tool: ToolPart): {
  icon: TimelineIcon;
  label: string;
  detail?: string;
  stat?: TimelineStat;
  tone: TimelineTone;
} {
  const running = tool.status === "running";
  const failed = tool.status === "error";

  if (COMMAND_TOOLS.has(tool.name)) return classifyCommand(tool);

  if (EDIT_TOOLS.has(tool.name)) {
    const file = shortPath(tool.target || "file");
    return {
      icon: "file",
      label: `${editVerb(tool.name, running)} ${file}`,
      detail: failed ? (extractErrorLine(tool.output) ?? "Edit failed") : undefined,
      stat: diffStatOf(tool),
      tone: failed ? "error" : "muted",
    };
  }

  if (tool.name === "web_search") {
    return {
      icon: "search",
      label: running ? "Searching the web" : "Searched the web",
      detail: clipLine(tool.target, 60) || undefined,
      tone: failed ? "error" : "muted",
    };
  }

  if (tool.name === "web_fetch") {
    let host = tool.target;
    try {
      host = new URL(tool.target).hostname;
    } catch {
      host = clipLine(tool.target, 50);
    }
    return {
      icon: "globe",
      label: running ? "Reading web page" : "Read web page",
      detail: host || undefined,
      tone: failed ? "error" : "muted",
    };
  }

  if (tool.name === "todo_write") {
    const verb = running ? "Updating plan" : "Updated plan";
    return {
      icon: "task",
      label: tool.target ? `${verb} (${tool.target})` : verb,
      tone: failed ? "error" : "muted",
    };
  }

  if (tool.name === "git_fetch") {
    return {
      icon: "git",
      label: running ? `Fetching ${tool.target || "branch"}` : `Fetched ${tool.target || "branch"}`,
      tone: failed ? "error" : "muted",
    };
  }

  if (tool.name === "computer_wake" || tool.name === "computer_status") {
    return {
      icon: "computer",
      label: computerLabel(tool.name, running),
      tone: failed ? "error" : "muted",
    };
  }

  if (PROCESS_TOOLS.has(tool.name)) {
    const labelMap: Record<string, [string, string]> = {
      list_processes: ["Checking processes", "Checked processes"],
      read_process_logs: ["Reading process logs", "Read process logs"],
      stop_process: ["Stopping process", "Stopped process"],
      wait_for_process: ["Waiting for process", "Process finished"],
      wait_for_port: ["Waiting for server", "Server ready"],
      list_ports: ["Checking ports", "Checked ports"],
    };
    const [active, done] = labelMap[tool.name] ?? ["Checking process", "Checked process"];
    return {
      icon: tool.name === "wait_for_port" ? "browser" : "terminal",
      label: running ? active : done,
      detail: tool.target ? clipLine(tool.target, 40) : undefined,
      tone: failed ? "error" : "muted",
    };
  }

  if (tool.name === "view_image") {
    return {
      icon: "browser",
      label: running ? "Inspecting image" : "Inspected image",
      detail: shortPath(tool.target) || undefined,
      tone: failed ? "error" : "muted",
    };
  }

  const words = tool.name.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  let detail: string | undefined;

  if (failed) detail = extractErrorLine(tool.output) ?? "Tool failed";
  else if (tool.target) detail = clipLine(tool.target, 50);

  return {
    icon: failed ? "warning" : "terminal",
    label: running ? `Running ${words || "tool"}` : `Used ${words || "tool"}`,
    detail,
    tone: failed ? "error" : "muted",
  };
}

function exploreSummary(tools: readonly ToolPart[], running: boolean): string {
  const files = new Set<string>();
  let searches = 0;
  for (const tool of tools) {
    if (tool.name === "read_file" && tool.target) files.add(tool.target);
    else if (tool.name === "grep" || tool.name === "find" || tool.name === "glob") searches += 1;
  }

  if (files.size > 0 && searches === 0) {
    const verb = running ? "Reading" : "Explored";

    if (files.size === 1) return `${verb} ${shortPath([...files][0]!)}`;

    return `${verb} ${files.size} files`;
  }

  if (searches > 0 && files.size === 0) {
    if (running) return "Searching codebase";

    return searches === 1 ? "Searched codebase" : `Searched codebase (${searches} queries)`;
  }

  const verb = running ? "Exploring" : "Explored";
  return files.size > 0 ? `${verb} ${files.size} files and searched codebase` : `${verb} codebase`;
}

function applyNarration(item: TimelineItem, narration: ToolNarration | undefined): TimelineItem {
  if (!narration) return item;

  return {
    ...item,
    label: narration.label,
    detail: undefined,
    outcome: undefined,
    icon: narration.icon ?? item.icon,
    tone: narration.tone ?? item.tone,
  };
}

export function projectTimeline(
  entries: readonly TimelineEntryInput[],
  narrations?: Readonly<Record<string, ToolNarration>>,
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const narrated = new Set<TimelineItem>();
  let pendingReasoning: string[] = [];

  for (const entry of entries) {
    if (entry.type === "reasoning") {
      if (entry.text.trim()) pendingReasoning.push(entry.text);

      continue;
    }

    const { tool } = entry;
    const narration = narrations?.[tool.id];
    const running = tool.status === "running";
    const last = items.at(-1);

    if (EXPLORE_TOOLS.has(tool.name) && !narration) {
      if (
        last &&
        !narrated.has(last) &&
        last.tools.length > 0 &&
        last.tools.every((item) => EXPLORE_TOOLS.has(item.name))
      ) {
        last.tools.push(tool);
        last.running = last.running || running;

        if (tool.status === "error") last.tone = "error";

        last.label = exploreSummary(last.tools, last.running);

        if (pendingReasoning.length > 0) {
          last.reasoning.push(...pendingReasoning);
          pendingReasoning = [];
        }

        continue;
      }

      items.push({
        id: tool.id,
        icon: "search",
        label: exploreSummary([tool], running),
        tone: tool.status === "error" ? "error" : "muted",
        running,
        tools: [tool],
        reasoning: pendingReasoning,
      });
      pendingReasoning = [];
      continue;
    }

    if (
      EDIT_TOOLS.has(tool.name) &&
      !narration &&
      tool.status !== "error" &&
      last &&
      !narrated.has(last) &&
      last.tone !== "error" &&
      last.tools.length > 0
    ) {
      const sameFile =
        tool.target &&
        last.tools.every((item) => EDIT_TOOLS.has(item.name) && item.target === tool.target);

      if (sameFile) {
        last.tools.push(tool);
        last.running = last.running || running;
        last.label = `${editVerb(tool.name, last.running)} ${shortPath(tool.target)}`;
        last.stat = mergeStats(last.stat, diffStatOf(tool));

        if (pendingReasoning.length > 0) {
          last.reasoning.push(...pendingReasoning);
          pendingReasoning = [];
        }

        continue;
      }
    }

    const classified = classifySingleTool(tool);
    const base: TimelineItem = {
      id: tool.id,
      icon: classified.icon,
      label: classified.label,
      detail: classified.detail,
      stat: classified.stat,
      tone: classified.tone,
      running,
      tools: [tool],
      reasoning: pendingReasoning,
    };
    pendingReasoning = [];
    const projected = applyNarration(base, narration);

    if (narration) narrated.add(projected);

    items.push(projected);
  }

  if (pendingReasoning.length > 0) {
    const last = items.at(-1);

    if (last) last.reasoning.push(...pendingReasoning);
    else {
      items.push({
        id: "reasoning-only",
        icon: "sparkles",
        label: "Thinking",
        tone: "muted",
        running: false,
        tools: [],
        reasoning: pendingReasoning,
      });
    }
  }

  return items;
}

export function liveStepOf(
  messages: readonly ChatMessage[],
  narrations?: Readonly<Record<string, ToolNarration>>,
): LiveStep | null {
  const last = messages.at(-1);

  if (!last || last.role !== "assistant") return null;

  for (let index = last.parts.length - 1; index >= 0; index -= 1) {
    const part = last.parts[index]!;

    if (part.type === "tool" && part.tool.status === "running") {
      if (part.tool.subagents?.length) {
        const active = part.tool.subagents.find((subagent) => subagent.status === "running");
        return {
          icon: "sparkles",
          label: active?.description || "Running subagents",
        };
      }

      const [item] = projectTimeline([{ type: "tool", tool: part.tool }], narrations);
      return item ? { icon: item.icon, label: item.label } : null;
    }

    if (part.type === "reasoning" && index === last.parts.length - 1) {
      return { icon: "sparkles", label: "Thinking" };
    }
  }

  return null;
}

function parsePlanLine(raw: string): PlanTask | null {
  const trimmed = raw.trim();
  const bracketed = trimmed.match(/^\[( |~|x)\]\s+(.+)$/i);

  if (bracketed) {
    return { status: planStatusOf(bracketed[1]!.toLowerCase()), content: bracketed[2]!.trim() };
  }

  const codex = raw.match(/^(x| ) (.+)$/);

  if (codex) {
    const content = codex[2]!.trim();

    if (content) return { status: codex[1] === "x" ? "completed" : "pending", content };
  }

  return null;
}

export function latestPlanOf(parts: readonly MessagePart[]): PlanTask[] | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]!;

    if (part.type !== "tool" || part.tool.name !== "todo_write" || !part.tool.output) continue;

    if (part.tool.output.trim() === "Task list cleared.") return null;

    const tasks = part.tool.output.split("\n").flatMap((raw) => {
      const parsed = parsePlanLine(raw);
      return parsed ? [parsed] : [];
    });

    if (tasks.length > 0) return tasks;
  }

  return null;
}

export function proofOf(parts: readonly MessagePart[]): TurnProof {
  const checkMap = new Map<string, ProofCheck>();
  const fileMap = new Map<string, ProofFile>();

  const recordCheck = (category: string, check: ProofCheck) => {
    checkMap.delete(category);
    checkMap.set(category, check);
  };

  for (const part of parts) {
    if (part.type !== "tool" || part.tool.status === "running") continue;

    const { tool } = part;

    if (EDIT_TOOLS.has(tool.name) && tool.status === "done" && tool.target) {
      const stat = diffStatOf(tool) ?? { additions: 0, deletions: 0 };
      const existing = fileMap.get(tool.target);

      if (existing) {
        existing.additions += stat.additions;
        existing.deletions += stat.deletions;
      } else {
        fileMap.set(tool.target, {
          path: tool.target,
          additions: stat.additions,
          deletions: stat.deletions,
        });
      }

      continue;
    }

    if (!COMMAND_TOOLS.has(tool.name)) continue;

    const cmd = tool.target.trim();
    const failed = tool.status === "error";

    if (TEST_CMD.test(cmd)) {
      const outcome = parseTestOutcome(tool.output, failed);
      recordCheck("test", {
        id: tool.id,
        label: outcome.label,
        status: failed ? "fail" : "pass",
        detail: clipLine(cmd, 80),
      });
    } else if (TYPECHECK_CMD.test(cmd)) {
      recordCheck("typecheck", {
        id: tool.id,
        label: failed ? "Typecheck failed" : "Typecheck clean",
        status: failed ? "fail" : "pass",
        detail: clipLine(cmd, 80),
      });
    } else if (LINT_CMD.test(cmd)) {
      recordCheck("lint", {
        id: tool.id,
        label: failed ? "Lint failed" : "Lint clean",
        status: failed ? "fail" : "pass",
        detail: clipLine(cmd, 80),
      });
    } else if (BUILD_CMD.test(cmd)) {
      recordCheck("build", {
        id: tool.id,
        label: failed ? "Build failed" : "Build succeeded",
        status: failed ? "fail" : "pass",
        detail: clipLine(cmd, 80),
      });
    }
  }

  return { checks: [...checkMap.values()], files: [...fileMap.values()] };
}
