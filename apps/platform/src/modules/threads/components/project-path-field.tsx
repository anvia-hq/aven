import { Button } from "@/components/button";
import { TextField } from "@/components/text-field";

import { useRecentPaths } from "../hooks/use-recent-paths";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

// The directory the agent works in. It must be an absolute path on the machine running the
// backend; recent paths are offered as shortcuts.
export function ProjectPathField({ value, onChange }: Props) {
  const recent = useRecentPaths();

  return (
    <div className="flex flex-col gap-2">
      <TextField
        label="Project path"
        name="projectPath"
        value={value}
        placeholder="/Users/you/code/my-project"
        autoComplete="off"
        spellCheck={false}
        className="font-mono"
        onChange={(event) => onChange(event.target.value)}
      />
      {recent.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Recent project paths">
          {recent.map((path) => (
            <Button
              key={path}
              variant="outline"
              size="sm"
              title={path}
              className="max-w-full font-mono text-xs font-normal text-muted-foreground"
              onClick={() => onChange(path)}
            >
              <span className="truncate">{path}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
