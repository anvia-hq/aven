import type { ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Agent text can link anywhere; never navigate the app away from the thread.
function ExternalLink({ node: _node, ...props }: ComponentProps<"a"> & { node?: unknown }) {
  return <a {...props} target="_blank" rel="noreferrer noopener" />;
}

// Markdown as prose. Wide code and tables scroll inside themselves, never the page.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose max-w-none min-w-0 text-sm leading-6 break-words prose-headings:font-semibold prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:text-xs prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-pre:[&_code]:bg-transparent prose-pre:[&_code]:p-0 prose-table:block prose-table:overflow-x-auto prose-a:underline prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-4 prose-headings:mb-2 prose-pre:my-2 prose-blockquote:my-2 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-muted-foreground prose-blockquote:before:content-none prose-blockquote:after:content-none first:*:mt-0 last:*:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ExternalLink }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
