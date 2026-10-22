import type { DiffLine } from "../types";

const styles: Record<DiffLine["type"], string> = {
  add: "bg-success/10 text-success",
  del: "bg-destructive/10 text-destructive",
  ctx: "text-muted-foreground",
};

const marks: Record<DiffLine["type"], string> = { add: "+", del: "-", ctx: " " };

export function DiffBlock({ lines }: { lines: DiffLine[] }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-background/60 py-1 font-mono text-xs leading-5">
      {lines.map((line, index) => (
        <div key={index} className={`flex px-3 ${styles[line.type]}`}>
          <span className="w-4 shrink-0 select-none">{marks[line.type]}</span>
          <span className="whitespace-pre">{line.text}</span>
        </div>
      ))}
    </pre>
  );
}
