# A sidebar machine row shows its busiest metric

Status: accepted.

## Context

Each machine row in the sidebar showed three small vertical bars with CPU, MEM and DSK percents in 8px and 10px type. It was dense and hard to read in a 32px row.

## Decision

- A row shows one pill with the metric that has the highest percent, for example "DSK 76%", with a dot and a tint in the level's colour (below 60, from 60, from 90, as before).
- A figure that is not known is skipped; when none is known the pill shows CPU as a dash. A tie goes to the first of CPU, memory, disk.
- The tooltip still lists all three metrics with their details and the sandbox count.
- The row stays one line of 32px. The Settings runtimes list keeps its bars.

## Consequences

- A person sees at once whether a machine is under load, but not all three figures without hovering.
- Each row exposes one `meter` to assistive tools, for the busiest metric, instead of three.
