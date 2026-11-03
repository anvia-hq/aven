import { lazy, Suspense } from "react";

import type { RichTextEditorProps } from "./rich-text-editor-view";

// BlockNote is large: it is loaded the first time an editor is shown, not with the app.
const View = lazy(() => import("./rich-text-editor-view"));

// A body in the cockpit, written in BlockNote (decision 0105).
export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense fallback={<div className="min-h-24 animate-pulse rounded-md bg-muted/40" />}>
      <View {...props} />
    </Suspense>
  );
}
