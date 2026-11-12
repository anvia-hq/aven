# The limits come from the event's unified windows

Status: accepted. Refines 0251.

## Context

Decision 0251 took the 5-hour and weekly windows from the experimental `usage` method, with the `rate_limit_event` as a second source. Run against a real `claude setup-token` token, `usage` answers `rate_limits_available: false` with no subscription type, because the token has no profile scope. The `rate_limit_event` still arrives, and it holds both windows in `unifiedWindows` (`five_hour` and `seven_day`, each with `utilization`, `resetsAt` and `status`), with no `utilization` at its top level. The runner read only the top level, so a setup-token thread never showed the card.

## Decision

- **The event's `unifiedWindows` is read first**, one limit per known window. An event with the usage at its top level and a `rateLimitType` still counts as that one window, and an event with neither is no limits.
- **The experimental method stays** as a second source for logins that have the scope.
- The scale rule of 0251 is unchanged: a value up to 1 is a fraction.

## Not verified

The event's `utilization` was 0.81 and 0.12 on a real token. Whether those are fractions (81% and 12%) or percentages has to be compared with the account's own usage page.
