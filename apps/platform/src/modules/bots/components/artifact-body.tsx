import { useState } from "react";
import { Refresh } from "@mynaui/icons-react";

import { Button } from "@aven/ui/button";
import { Markdown } from "@/components/markdown";
import { Spinner } from "@aven/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@aven/ui/table";
import { ArtifactFrame } from "@/modules/threads/components/artifact-frame";

import { artifactSource, kindOf } from "../artifacts";
import { parseCsv } from "../csv";
import { useArtifactText } from "../hooks/use-artifact-text";
import type { ArtifactFile } from "../types";

function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="m-4 flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
      <span className="min-w-0 flex-1">
        This file is unavailable. The runner that keeps it may be offline.
      </span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        <Refresh className="size-4" />
        Retry
      </Button>
    </div>
  );
}

function CsvTable({ text }: { text: string }) {
  const [head = [], ...rows] = parseCsv(text);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {head.map((cell, index) => (
            <TableHead key={index}>{cell}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, index) => (
          <TableRow key={index}>
            {row.map((cell, at) => (
              <TableCell key={at}>{cell}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ArtifactBody({ botId, artifact }: { botId: string; artifact: ArtifactFile }) {
  const [attempt, setAttempt] = useState(0);
  const kind = kindOf(artifact.mediaType);
  const base = artifactSource(botId, artifact.name);
  const src = attempt === 0 ? base : `${base}?attempt=${attempt}`;
  const retry = () => setAttempt((count) => count + 1);
  const wantsText = kind === "markdown" || kind === "csv" || kind === "text";
  const text = useArtifactText(base, wantsText, attempt);

  if (kind === "pdf") {
    return (
      <iframe
        key={src}
        src={src}
        title={artifact.title}
        referrerPolicy="no-referrer"
        className="size-full border-0"
      />
    );
  }

  if (kind === "page") {
    return <ArtifactFrame key={src} src={src} label={artifact.title} />;
  }

  if (kind === "image") {
    return (
      <div className="flex size-full items-start justify-center overflow-auto p-4">
        <img src={src} alt={artifact.title} className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  if (kind === "video") {
    return (
      <div className="flex size-full items-center justify-center p-4">
        <video
          src={src}
          controls
          playsInline
          aria-label={artifact.title}
          className="max-h-full max-w-full rounded-lg bg-black"
        />
      </div>
    );
  }

  if (text.status === "loading") {
    return (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (text.status === "failed") return <Unavailable onRetry={retry} />;

  return (
    <div className="size-full overflow-auto p-4" data-role="artifact-text">
      {kind === "markdown" && <Markdown>{text.text}</Markdown>}
      {kind === "csv" && <CsvTable text={text.text} />}
      {kind === "text" && (
        <pre className="font-mono text-sm leading-6 break-words whitespace-pre-wrap">
          {text.text}
        </pre>
      )}
    </div>
  );
}
