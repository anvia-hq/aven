#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import ts from "typescript";

const DIRECTIVE = /^\s*(@ts-|oxlint-|eslint-|\/\s*<reference)/;

function commentsOf(file: string) {
  const text = readFileSync(file, "utf8");
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    file.endsWith("x") ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    text,
  );
  const found: { line: number; text: string }[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind !== ts.SyntaxKind.SingleLineCommentTrivia && kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const comment = scanner.getTokenText();
    const body = comment.replace(/^\/\/|^\/\*+|\*+\/$/g, "");
    const start = scanner.getTokenStart();
    if (DIRECTIVE.test(body) || (start === 0 && comment.startsWith("#!"))) continue;
    found.push({ line: text.slice(0, start).split("\n").length, text: comment.split("\n")[0]! });
  }
  return found;
}

const files = process.argv.slice(2).filter((file) => /\.tsx?$/.test(file));
let total = 0;
for (const file of files) {
  for (const { line, text } of commentsOf(file)) {
    console.log(`${file}:${line}: ${text.trim()}`);
    total++;
  }
}
console.log(total === 0 ? "no comments" : `${total} comment(s)`);
process.exit(total === 0 ? 0 : 1);
