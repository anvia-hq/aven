import { useState } from "react";

import { toast } from "@/components/toast";
import { api, attempt, postJson } from "@/lib/api";
import { useModelSelection } from "@/modules/threads/hooks/use-model-selection";
import type { ProcessLogs, ProcessView } from "@aven/protocol/types";

const OUTPUT_CHARS = 6_000;

export function fixPrompt(process: ProcessView, logs: ProcessLogs) {
  const output = `${logs.stdout}${logs.stderr}`.trimEnd().slice(-OUTPUT_CHARS);
  const longest = Math.max(0, ...[...output.matchAll(/`+/g)].map((run) => run[0].length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return [
    `\`${process.command}\` failed with exit code ${process.exitCode}. Find the cause and fix it, then run it again to check.`,
    "",
    "Its output (the end of it):",
    fence,
    output || "(nothing printed)",
    fence,
  ].join("\n");
}

export function useFixProcess(threadId: string) {
  const [fixing, setFixing] = useState<string | null>(null);
  const { selection } = useModelSelection(threadId);

  async function fix(process: ProcessView) {
    setFixing(process.id);
    const sent = await attempt("Could not ask the agent", async () => {
      const logs = await api<ProcessLogs>(
        `/threads/${threadId}/processes/${encodeURIComponent(process.id)}/logs`,
      );
      return postJson(`/threads/${threadId}/messages`, {
        prompt: fixPrompt(process, logs),
        ...selection,
      });
    });
    setFixing(null);
    if (sent !== null) {
      toast.add({
        title: "Asked the agent",
        description: "It is looking at the failure in this thread",
        type: "success",
      });
    }
  }

  return { fixing, fix };
}
