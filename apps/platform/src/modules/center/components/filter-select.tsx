import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

type Option<T extends string> = { value: T; label: string };

// One of the filter bar's choices, as a small select; `any` stands for "no filter" and has the
// field's own name as its label, so the closed select reads as the field.
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: Option<T>[];
  onChange: (value: T | undefined) => void;
}) {
  const ANY = "__any__";
  const items = [{ value: ANY, label }, ...options];
  return (
    <Select
      items={items}
      value={value ?? ANY}
      onValueChange={(next) => onChange(next === ANY ? undefined : (next as T))}
    >
      <SelectTrigger size="sm" aria-label={label} className={value ? "" : "text-muted-foreground"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
