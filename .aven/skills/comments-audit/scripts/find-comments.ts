#!/usr/bin/env bun
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const DIRECTIVE = /^\s*(@ts-|oxlint-|eslint-|\/\s*<reference)/;

function commentsOf(file: string) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const seen = new Set<number>();
  const found: { line: number; text: string }[] = [];

  const collect = (node: ts.Node) => {
    const start = node.getFullStart();
    const ranges = (ts.getLeadingCommentRanges(text, start) ?? []).concat(
      ts.getTrailingCommentRanges(text, start) ?? [],
    );
    for (const range of ranges) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const comment = text.slice(range.pos, range.end);
      const body = comment.replace(/^\/\/|^\/\*+|\*+\/$/g, "");
      if (DIRECTIVE.test(body)) continue;
      found.push({
        line: source.getLineAndCharacterOfPosition(range.pos).line + 1,
        text: comment.split("\n")[0]!,
      });
    }
  };

  const visit = (node: ts.Node) => {
    const children = node.getChildren(source);
    if (children.length === 0 && node.kind !== ts.SyntaxKind.JsxText) collect(node);
    children.forEach(visit);
  };
  visit(source);
  return found.sort((a, b) => a.line - b.line);
}

const files = [...new Set(process.argv.slice(2))].filter(
  (file) => /\.tsx?$/.test(file) && existsSync(file),
);
let total = 0;
for (const file of files) {
  for (const { line, text } of commentsOf(file)) {
    console.log(`${file}:${line}: ${text.trim()}`);
    total++;
  }
}
console.log(total === 0 ? "no comments" : `${total} comment(s)`);
process.exit(total === 0 ? 0 : 1);
