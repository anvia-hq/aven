import { StreamMarkdown } from "@anvia/react-ui/stream";
import type { ComponentProps } from "react";
import type { Components } from "react-markdown";

// Agent text can link anywhere; never navigate the app away from the thread.
function ExternalLink({ node: _node, ...props }: ComponentProps<"a"> & { node?: unknown }) {
  return <a {...props} target="_blank" rel="noreferrer noopener" />;
}

const components = { a: ExternalLink };

// Markdown as prose. Wide code and tables scroll inside themselves, never the page. While `live`,
// text arriving at the end fades in (the reveal in index.css) and only the block being written is
// parsed again, so a streaming answer reads as one continuous flow. Pacing bursty text is the
// caller's (a thread's `useSmoothParts`, decision 0028).
export function Markdown({
  children,
  live = false,
  components: extra,
}: {
  children: string;
  live?: boolean;
  /** Element overrides beside the external link, such as a caller's own inline code. */
  components?: Components;
}) {
  return (
    <StreamMarkdown
      content={children}
      live={live}
      components={extra ? { ...components, ...extra } : components}
      className="prose max-w-none min-w-0 text-sm leading-6 break-words prose-headings:font-semibold prose-headings:[&_code]:text-(--tw-prose-code) prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm prose-headings:leading-snug prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:text-[1em] prose-pre:leading-6 prose-code:rounded prose-code:bg-code/10 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:[&_code]:bg-transparent prose-pre:[&_code]:p-0 prose-table:my-3 prose-table:block prose-table:text-[1em] prose-table:leading-6 prose-table:overflow-x-auto prose-a:underline prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-4 prose-headings:mb-2 prose-pre:my-2 prose-blockquote:my-2 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-muted-foreground prose-blockquote:before:content-none prose-blockquote:after:content-none first:*:mt-0 last:*:mb-0"
    />
  );
}
