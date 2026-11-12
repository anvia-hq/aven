# The Limits card shows the Claude subscription's windows

Status: accepted.

## Context

A thread on the Claude backend runs on the person's subscription, which has a 5-hour and a weekly limit. The overview had no way to show how much of them was used, and the Agent SDK offers two sources: a `rate_limit_event` message that `query()` streams for claude.ai subscription users when the information changes, and an experimental `usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET` method on the query that returns the plan windows (`utilization` 0 to 100, `resets_at`).

## Decision

- **The stable event is the source, the experimental method fills the gap.** The runner maps `rate_limit_event` (`five_hour` and `seven_day` only) and, once per query, the experimental method, into one run event, `limits`, a list of `PlanLimit` (`window`, `status`, `percent` 0 to 100, `resetsAt` in milliseconds). A failure of the method, or a shape it does not have, is no data: it never fails a run. The method's windows have no status, so they are `allowed`.
- **The latest value per window is kept for the run.** The control plane merges `limits` into the run's usage, so a snapshot of a running thread carries them, and the platform merges them into the thread's usage. Nothing is stored: when the thread is idle and opened afresh, the card appears again after the next run.
- **The card is for the Claude backend only.** The platform shows it when `thread.agentBackend` is `claude` and there is a limit to show, and never for an API-key model.
- **A warning is orange and a rejection is destructive**, drawn with the `meter` and `destructive` tokens so every theme follows.
- **The wire version stays.** `limits` is a new run event the control plane's allow-list knows, and a control plane from before drops what it does not know.

## Not verified

Nobody has run this against a real subscription login. The scale of `utilization` in `rate_limit_event` is not documented: the runner takes a value up to 1 as a fraction and a larger one as a percentage, and `resetsAt` below 1e11 as seconds. Check both against a real account.
