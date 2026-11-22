import { IconChevronsDown, IconChevronsUp, IconColumns2 } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@aven/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@aven/ui/tabs";
import { DiffFilePicker } from "@/modules/diff/components/diff-file-picker";
import { DiffVirtualList } from "@/modules/diff/components/diff-virtual-list";
import { flatten, startsOpen } from "@/modules/diff/flatten";
import { parsePatch } from "@/modules/diff/parse-patch";
import { isDiffLayout, type DiffLayout } from "@/modules/diff/types";

type Props = {
  patch: string;
  truncated?: boolean;
  emptyMessage?: string;
  resetKey: string;
};

export function GitDiffViewer({
  patch,
  truncated = false,
  emptyMessage = "No diff to display.",
  resetKey,
}: Props) {
  const [layout, setLayout] = useState<DiffLayout>("unified");
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [scrollTo, setScrollTo] = useState<{ path: string; seq: number } | null>(null);

  useEffect(() => {
    setOpened({});
    setScrollTo(null);
  }, [resetKey]);

  const files = useMemo(() => parsePatch(patch), [patch]);
  const totals = useMemo(() => {
    let additions = 0;
    let deletions = 0;

    for (const f of files) {
      additions += f.additions;
      deletions += f.deletions;
    }

    return { additions, deletions };
  }, [files]);

  const items = useMemo(() => flatten(files, layout, opened), [files, layout, opened]);
  const anyOpen = useMemo(
    () => files.some((file) => opened[file.path] ?? startsOpen(file)),
    [files, opened],
  );

  if (files.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  const toggleAll = () => {
    const next: Record<string, boolean> = {};

    for (const file of files) next[file.path] = !anyOpen;

    setOpened(next);
  };

  const jumpToFile = (path: string) => {
    setOpened((now) => (now[path] === true ? now : { ...now, [path]: true }));
    setScrollTo((prev) => ({ path, seq: (prev?.seq ?? 0) + 1 }));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 border-b border-border px-2.5 py-1.5">
        <div className="min-w-0 flex-1">
          <DiffFilePicker
            files={files}
            additions={totals.additions}
            deletions={totals.deletions}
            onSelect={jumpToFile}
          />
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={anyOpen ? "Collapse all files" : "Expand all files"}
          title={anyOpen ? "Collapse all files" : "Expand all files"}
          onClick={toggleAll}
        >
          {anyOpen ? (
            <IconChevronsUp className="size-3.5" />
          ) : (
            <IconChevronsDown className="size-3.5" />
          )}
        </Button>
        <Tabs value={layout} onValueChange={(next) => isDiffLayout(next) && setLayout(next)}>
          <TabsList aria-label="Diff layout">
            <TabsTrigger value="unified" aria-label="Unified">
              <IconColumns2 className="size-3.5 rotate-90" />
            </TabsTrigger>
            <TabsTrigger value="split" aria-label="Split">
              <IconColumns2 className="size-3.5" />
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <DiffVirtualList
          items={items}
          scrollTo={scrollTo}
          onToggle={(file, open) => setOpened((now) => ({ ...now, [file.path]: open }))}
          footer={truncated ? "Diff output was truncated at 512 KiB." : undefined}
        />
      </div>
    </div>
  );
}
