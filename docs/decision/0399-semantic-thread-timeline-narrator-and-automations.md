# Semantic thread timeline, sidecar narrator, proof-of-work, and thread automations

Status: accepted. Builds on 0115 (tool group reasoning) and 0390 (single-line subagents).

## Context

Aven threads previously rendered tool calls as raw execution logs folded twice—behind `"Worked for Xm"` and `"Read N files, ran M commands"`—while `WorkingIndicator` cycled playful words (`working-words.ts`) and the Overview rail put token usage and context bars ahead of work progress. Meanwhile, webhooks and schedules lived exclusively inside Bots rather than spawning autonomous coding threads directly.

## Decision

- **Semantic Activity Timeline (`packages/protocol/src/timeline.ts`, `apps/platform/src/modules/threads/components/activity-timeline.tsx`)**: Project consecutive tool calls and reasoning into a flat, icon-led narrative spine across all three backends (`native`, `claude`, `codex`). Exploration calls (`read_file`, `grep`, `find`, `glob`, `list_files`) coalesce into one quiet step; sequential edits to the same file coalesce with combined `+a -d` stats; test, typecheck, lint, build, browser, and `gh` PR/CI commands emit parsed action and outcome rows. Every row expands on click to reveal its underlying raw `ToolCall`s and reasoning. Completed turns default open with a collapsible `"Worked for Xm"` header, and `WorkingIndicator` displays the active semantic step from `liveStepOf` instead of random words.
- **Sidecar Narrator (`apps/control-plane/src/modules/runs/narrator.ts`, `thread_narrations`)**: `RunManager` asynchronously narrates high-signal completed tool calls using `serverModelsService.small()` via `@anvia/core/extractor`, persists overrides in `thread_narrations`, and broadcasts an additive `{ type: "narration", narration }` `RunEvent` (and `snapshot.narrations`). No runner `WIRE_VERSION` change is required; when no small model is configured, the deterministic timeline applies cleanly.
- **Inline Proof-of-Work & Calmer Chrome (`plan-card.tsx`, `proof-strip.tsx`, `overview-column.tsx`, `GET /threads/:id/pull-requests/checks`)**: Promote `todo_write` task lists into an inline `PlanCard`, surface system-verified checks, changed file counts (opening Changes), and live GitHub PR CI status pills in `ProofStrip`, and tuck Context/Limits/Usage under a collapsed `"Model & usage"` section in `OverviewColumn`.
- **Thread Automations (`packages/db/src/schema/automations.ts`, `automation-runs.ts`, `apps/control-plane/src/modules/automations/`, `apps/platform/src/modules/automations/`, `/automations`)**: First-class webhook and cron triggers scoped to an organization, user, project, and runtime that spawn autonomous coding threads directly and track run history linked to each spawned thread.

## Consequences

- Older native clients ignore the additive `narration` event safely and keep decoding snapshots without breaking.
- New tables `thread_narrations`, `automations`, and `automation_runs` are added via Drizzle migration `0090_thread-narrations-and-automations.sql`.
