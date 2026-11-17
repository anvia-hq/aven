export const FRESH_JOURNAL_COMMAND =
  "systemctl --user stop aven-runner >/dev/null 2>&1; rm -rf /home/user/.aven/runtime/runs.db*";
