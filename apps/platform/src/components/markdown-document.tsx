import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { isAbsoluteUrl } from "@/modules/projects/repo-links";

import { MARKDOWN_CLASS, settled } from "./markdown";

const components: Components = {
  ...settled,
  a: ({ node: _node, href, children, ...props }) =>
    href && isAbsoluteUrl(href) ? (
      <settled.a {...props} href={href}>
        {children}
      </settled.a>
    ) : (
      <span>{children}</span>
    ),
  img: ({ node: _node, src, alt, ...props }) =>
    typeof src === "string" && isAbsoluteUrl(src) ? (
      <img {...props} alt={alt ?? ""} src={src} className="max-w-full" />
    ) : null,
};

export function MarkdownDocument({ children }: { children: string }) {
  return (
    <div className={MARKDOWN_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSanitize]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
