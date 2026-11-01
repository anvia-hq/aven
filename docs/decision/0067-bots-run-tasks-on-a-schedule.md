# Bots run tasks on a schedule

Status: accepted. Builds on 0058, 0059, 0063, 0065 and 0066. The model is the Anvia harness's schedules: four tools, cron with a timezone, and a note that wakes the bot when a task is due.

## Context

A bot only spoke when it was spoken to. A person who asks for "the news every morning" had no way to have a bot do it. The harness gives bots `createSchedule`, `listSchedules`, `updateSchedule` and `deleteSchedule`; the person asked for bots to work like that.

## Decision

- **Four tools on every bot**: `create_schedule`, `list_schedules`, `update_schedule` (which also pauses and resumes) and `delete_schedule`. They are one runtime call, `bot.schedule` (wire version 31), with an operation, answered by the reply's own sink. A schedule has a name, a cron (five fields, or a nickname such as `@daily`), a timezone, the task as a prompt written to the bot, and the bot that runs it, by handle, the one asking unless it says another (`bot_schedules`). A person may have at most `SCHEDULES_LIMIT` (50), counted under a lock so schedules made at once cannot pass it, and a schedule may run at most once every 15 minutes (the next three times are checked).
- **The cron is the harness's own** (`modules/schedules/cron.ts`, with its tests): lists, ranges, steps, month and weekday names, either-day semantics when both day fields are set, and the person's wall clock across daylight saving changes.
- **The timezone is the person's** (`user_settings.timezone`, `GET` and `PUT /preferences`): the bot is told it in its instructions (`BotReplyInfo.timezone`) and a schedule is on that clock unless the bot names another. A person who has not chosen one is put in their browser's the first time they open a bot's page, and Settings > Preferences changes it. The time itself is not in the instructions, since a changing prompt would defeat prompt caching: `list_schedules` and `create_schedule` return each next run.
- **A scheduler wakes the bot** (`createScheduler`, every 30 seconds from the control plane's start): a schedule that is due is claimed by moving its next time on, so a second tick or process runs it once, and the bot is woken with a note, `[note] Scheduled task "…" … The task: …`, as a just-made bot is for its greeting. The note says nobody is watching: no `ask_question`, no message just to say it started. The status of each time is kept: `started`, `late` (more than two minutes), `busy` (the bot was answering: skipped), `missed` (more than six hours late, as after an outage: skipped) and `failed` (no model, or the computer offline).
- **Only the person's word changes a schedule.** A schedule is a standing order, so the control plane answers `create`, `update` and `delete` only for a reply whose prompt is the person's own or the main bot's passing it on, as for `bot.update` (0065), and never for a note or another bot's message. Looking is for any reply. So a scheduled run cannot make more schedules, and an injected bot cannot set a task to repeat.
- **The person sees and pauses them**: `GET /schedules`, `PATCH /schedules/:id` (enabled) and `DELETE /schedules/:id`. There is no page for it yet; the person asks the bot, which can list them.

## Consequences

- A scheduled run is an ordinary reply of the bot, in its chat: what the bot says is there, and it keeps its memory of the task between times.
- The control plane must be running for a task to start; one that was due while it was off runs late, or is missed after six hours.
- With one control plane the claim is only a guard; several would each tick, and the claim keeps a task to one of them.
- A bot made for a task can run a schedule of another bot by handle, but only as the person said.
