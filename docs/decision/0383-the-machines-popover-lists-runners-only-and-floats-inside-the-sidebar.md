# The machines popover lists runners only and is a card of gauges

Status: accepted

## Context

The popover over the rail's machines icon (decision 0091) listed every runtime, so Aven Cloud and a thread's sandbox showed up as "Offline" machines. A sandbox is started when a thread needs it and has no online state of a runner's kind, so the row was misleading. The card also touched both edges of the sidebar, and its rows were small meters beside text that ran out of room.

## Decision

- The popover lists runners only: a cloud runtime or a child sandbox (`isSandbox`) is left out, as Settings > Runtimes already does.
- The card floats 12px in from both sides of the sidebar, with large corners. Its header is the word MACHINES in mono capitals and the count. Each runner is a section under a hairline: a status dot (glowing while online), its name in mono capitals and a "Server" tag for the built-in runner.
- CPU, memory and disk are three equal columns split by hairlines, each a mono label, a large percent and ten bars of one height that light up in the meter colour with a soft glow (blue, orange from 60%, red from 90%). There is no history and no sandbox count: the bars show the load now.
- A runner that is off has no gauges: its name is muted and "Offline" sits at the end of its row. A connected runner that has not reported yet says why in one line.
- Settings > Runtimes keeps its compact `MachineLoad`.

## Consequences

- The header count counts runners only.
- Sandboxes are still reachable through the computer picker and the thread's Environment card.
