import { Check, Copy } from "@mynaui/icons-react";
import { Button } from "@/components/button";
import { useClipboard } from "@/hooks/use-clipboard";

type Props = {
  token: string;
};

// The command that starts a runtime with its token. Where a runtime on another machine reaches
// this control plane is this app's address, whose /api path is proxied to it.
export function RuntimeCommand({ token }: Props) {
  const { copied, copy } = useClipboard();
  const command = `AVEN_URL=${window.location.origin}/api AVEN_RUNTIME_TOKEN=${token} bun run --cwd apps/runtime start`;

  return (
    <div className="flex flex-col gap-3">
      <pre
        aria-label="Runtime command"
        className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-all"
      >
        {command}
      </pre>
      <div>
        <Button type="button" variant="outline" onClick={() => void copy(command)}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy command"}
        </Button>
      </div>
    </div>
  );
}
