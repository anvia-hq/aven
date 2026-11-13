import { lazy, Suspense } from "react";

import type { RichTextEditorProps } from "./rich-text-editor-view";

const View = lazy(() =>
  import("./rich-text-editor-view").then((module) => ({ default: module.RichTextEditorView })),
);

export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense fallback={<div className="min-h-24 animate-pulse rounded-md bg-muted/40" />}>
      <View {...props} />
    </Suspense>
  );
}
