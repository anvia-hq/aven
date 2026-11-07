import { StreamMarkdown } from "@anvia/react-ui/stream";
import type { ComponentProps } from "react";
import type { Components } from "react-markdown";

import { GithubMark } from "./brand-icons";

const PULL_REQUEST_URL = /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/;

function ExternalLink({
  node: _node,
  children,
  ...props
}: ComponentProps<"a"> & { node?: unknown }) {
  return (
    <a {...props} target="_blank" rel="noreferrer noopener">
      {props.href && PULL_REQUEST_URL.test(props.href) && (
        <GithubMark className="mr-1 inline size-[1em] align-[-0.125em]" />
      )}
      {children}
    </a>
  );
}

const components = { a: ExternalLink };

export function Markdown({
  children,
  live = false,
  components: extra,
}: {
  children: string;
  live?: boolean;
  components?: Components;
}) {
  return (
    <StreamMarkdown
      content={children}
      live={live}
      components={extra ? { ...components, ...extra } : components}
      className="prose max-w-none min-w-0 text-sm leading-6 break-words prose-headings:font-semibold prose-headings:[&_code]:text-(--tw-prose-code) prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-h4:text-sm prose-headings:leading-snug prose-pre:overflow-x-auto prose-pre:rounded-md prose-pre:text-[1em] prose-pre:leading-6 prose-code:rounded prose-code:bg-code/7 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-medium prose-code:before:content-none prose-code:after:content-none prose-pre:[&_code]:bg-transparent prose-pre:[&_code]:p-0 prose-table:my-3 prose-table:block prose-table:text-[1em] prose-table:leading-6 prose-table:overflow-x-auto prose-a:underline prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:mt-4 prose-headings:mb-2 prose-pre:my-2 prose-blockquote:my-2 prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-muted-foreground prose-blockquote:before:content-none prose-blockquote:after:content-none prose-hr:my-4! prose-hr:border-dashed first:*:mt-0 last:*:mb-0"
    />
  );
}
