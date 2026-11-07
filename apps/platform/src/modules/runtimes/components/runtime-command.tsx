import { Check, Copy } from "@mynaui/icons-react";
import { Button } from "@/components/button";
import { useClipboard } from "@/hooks/use-clipboard";

type Props = {
  token: string;
};

const INSTALL_SCRIPT = "https://raw.githubusercontent.com/anvia-hq/aven/main/install.sh";

export function RuntimeCommand({ token }: Props) {
  const { copied, copy } = useClipboard();
  const command = `curl -fsSL ${INSTALL_SCRIPT} | bash -s -- --runner --url ${window.location.origin}/api --token ${token}`;

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
