import { isValidElement } from "react";
import type { ComponentProps, ReactNode } from "react";

import { useHighlightedLines } from "../hooks/use-highlighted-lines";

type CodeProps = { className?: string; children?: ReactNode };

function HighlightedCode({ text, language }: { text: string; language: string }) {
  const coloured = useHighlightedLines(text, `snippet.${language}`);

  if (!coloured) return <code className={`language-${language}`}>{text}</code>;

  return (
    <code className={`language-${language}`}>
      {coloured.map((line, row) => (
        <span key={row}>
          {line.map((token, at) => (
            <span
              key={at}
              style={token.htmlStyle}
              className="text-(--shiki-light) dark:text-(--shiki-dark)"
            >
              {token.content}
            </span>
          ))}
          {row < coloured.length - 1 && "\n"}
        </span>
      ))}
    </code>
  );
}

export function CodeBlock({
  node: _node,
  children,
  live = false,
  ...props
}: ComponentProps<"pre"> & { node?: unknown; live?: boolean }) {
  const code = isValidElement<CodeProps>(children) ? children : null;
  const language = /language-([\w+#-]+)/.exec(code?.props.className ?? "")?.[1];
  const text = typeof code?.props.children === "string" ? code.props.children : null;

  if (live || !language || text === null) return <pre {...props}>{children}</pre>;

  return (
    <pre {...props}>
      <HighlightedCode text={text.replace(/\n$/, "")} language={language} />
    </pre>
  );
}
