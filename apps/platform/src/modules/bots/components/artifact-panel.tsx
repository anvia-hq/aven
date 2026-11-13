import { Download, File as FileIcon, X } from "@mynaui/icons-react";

import { Button } from "@aven/ui/button";
import { NativeSelect } from "@aven/ui/native-select";

import { artifactSource, downloadName } from "../artifacts";
import type { ArtifactFile, ArtifactGroup } from "../types";
import { ArtifactBody } from "./artifact-body";

export function ArtifactPanel({
  botId,
  group,
  version,
  number,
  onVersion,
  onClose,
}: {
  botId: string;
  group: ArtifactGroup;
  version: ArtifactFile;
  number: number;
  onVersion: (name: string) => void;
  onClose: () => void;
}) {
  const total = group.versions.length;

  return (
    <section
      aria-label={group.title}
      data-role="artifact-panel"
      className="flex size-full min-w-0 flex-col overflow-hidden bg-background md:rounded-xl md:border md:border-sidebar-border"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3 md:h-10">
        <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{group.title}</h2>
        {total > 1 && (
          <NativeSelect
            size="sm"
            aria-label="Version"
            value={version.name}
            onChange={(event) => onVersion(event.target.value)}
          >
            {group.versions.map((each, index) => (
              <option key={each.name} value={each.name}>
                {`Version ${total - index}${index === 0 ? " (latest)" : ""}`}
              </option>
            ))}
          </NativeSelect>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Download ${group.title}${total > 1 ? ` version ${number}` : ""}`}
          nativeButton={false}
          render={<a href={artifactSource(botId, version.name)} download={downloadName(version)} />}
        >
          <Download />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close file" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <ArtifactBody botId={botId} artifact={version} />
      </div>
    </section>
  );
}
