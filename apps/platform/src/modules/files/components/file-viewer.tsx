import { IconCode, IconEye } from "@tabler/icons-react";
import { useState } from "react";

import { MarkdownDocument } from "@/components/markdown-document";
import { PanelNotice } from "@/components/panel-notice";
import { Button } from "@aven/ui/button";
import { Skeleton } from "@aven/ui/skeleton";

import { isMarkdownPath } from "../paths";
import { useHighlightedLines } from "../hooks/use-highlighted-lines";
import { useWorkspaceFile } from "../hooks/use-workspace-file";

type Props = { threadId: string; path: string | null; running: boolean };

const KIB = 1024;

export function FileViewer({ threadId, path, running }: Props) {
  const { loaded, file, problem } = useWorkspaceFile(threadId, path, running);

  if (path === null) return <PanelNotice>Pick a file in the tree to read it.</PanelNotice>;

  if (!loaded) return <Skeleton className="size-full rounded-none" />;

  if (problem) return <PanelNotice>{problem}</PanelNotice>;

  if (!file?.available) return <PanelNotice>This thread has no workspace yet.</PanelNotice>;

  if (file.kind === "missing") return <PanelNotice>This file is no longer there.</PanelNotice>;

  if (file.kind === "binary") {
    return (
      <PanelNotice>Binary file, {Math.ceil(file.size / KIB)} KiB. It is not shown.</PanelNotice>
    );
  }

  if (isMarkdownPath(path)) {
    return <Document key={path} path={path} text={file.text} truncated={file.truncated} />;
  }

  return <Lines key={path} path={path} text={file.text} truncated={file.truncated} />;
}

function Document({ path, text, truncated }: { path: string; text: string; truncated: boolean }) {
  const [source, setSource] = useState(false);

  if (source) {
    return (
      <div className="relative size-full">
        <ViewToggle source onToggle={() => setSource(false)} />
        <Lines path={path} text={text} truncated={truncated} />
      </div>
    );
  }

  return (
    <div className="relative size-full overflow-auto">
      <ViewToggle source={false} onToggle={() => setSource(true)} />
      <div className="px-6 py-4">
        <MarkdownDocument>{text}</MarkdownDocument>
        {truncated && (
          <p className="mt-4 text-xs text-muted-foreground">
            The file is too large to show in full; the end of it is left out.
          </p>
        )}
      </div>
    </div>
  );
}

function ViewToggle({ source, onToggle }: { source: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="absolute top-2 right-3 z-10 bg-background/80 backdrop-blur"
      aria-label={source ? "Show the rendered file" : "Show the source"}
      title={source ? "Show the rendered file" : "Show the source"}
      onClick={onToggle}
    >
      {source ? <IconEye /> : <IconCode />}
    </Button>
  );
}

function Lines({ path, text, truncated }: { path: string; text: string; truncated: boolean }) {
  const shown = text.replace(/\n$/, "");
  const coloured = useHighlightedLines(shown, path);
  const lines = shown.split("\n");
  return (
    <div className="size-full overflow-auto font-mono text-xs leading-5">
      <div className="flex w-max min-w-full flex-col py-2">
        {lines.map((line, index) => (
          <div key={index} className="flex">
            <span className="w-12 shrink-0 select-none pr-3 text-right text-muted-foreground/60">
              {index + 1}
            </span>
            <span className="whitespace-pre pr-4">
              {coloured?.[index]
                ? coloured[index].map((token, at) => (
                    <span
                      key={at}
                      style={token.htmlStyle}
                      className="text-(--shiki-light) dark:text-(--shiki-dark)"
                    >
                      {token.content}
                    </span>
                  ))
                : line}
            </span>
          </div>
        ))}
        {truncated && (
          <p className="px-4 py-2 font-sans text-muted-foreground">
            The file is too large to show in full; the end of it is left out.
          </p>
        )}
      </div>
    </div>
  );
}
