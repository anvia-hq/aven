# 0261. A command that detaches itself is refused

An agent that wanted a server to outlive its turn wrapped it in `setsid nohup … &`. The process ran where Aven could not see it: it was not under Background tasks, nobody was told when it ended, and the agent and the user could not tell it from a command that had never started.

- `exec_command` refuses a command, or an argument, that uses `nohup`, `setsid`, `disown` or a trailing `&`, with or without `background: true`. The error says to run it again with `background: true`.
- The check is on the input, before anything runs, so the model cannot talk its way around it and nothing is started. It is a text match, not a parse of the shell: `a & b` and `2>&1` pass, and a determined script can still hide a detach, which is the agent's choice and not something to chase.
- The instructions tell the agent the same, so the refusal is rarely needed.
- `start_process` is unchanged: it is already the managed way.
