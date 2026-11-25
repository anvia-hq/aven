import { ToggleGroup, ToggleGroupItem } from "@aven/ui/toggle-group";

type Props = {
  levels: string[];
  value: string;
  onChange: (level: string) => void;
};

const NAMES: Record<string, string> = { xhigh: "Extra high" };

export function effortName(level: string) {
  const name = NAMES[level] ?? level;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function EffortSlider({ levels, value, onChange }: Props) {
  return (
    <ToggleGroup
      aria-label="Reasoning effort"
      spacing={0}
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0];

        if (picked) onChange(picked);
      }}
      className="grid w-full auto-cols-fr grid-flow-col rounded-lg bg-muted/60 p-0.5"
    >
      {levels.map((level) => (
        <ToggleGroupItem
          key={level}
          value={level}
          size="sm"
          className="h-7 min-w-0 rounded-md px-2 text-xs font-medium text-muted-foreground group-data-[spacing=0]/toggle-group:rounded-md hover:bg-transparent hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-xs"
        >
          {effortName(level)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
