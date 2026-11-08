import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/select";

type Option = { value: string; label: string };

type Props = {
  label: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function LabeledSelect({ label, options, value, onChange, placeholder, disabled }: Props) {
  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <span>{label}</span>
      <Select
        items={options}
        value={value}
        disabled={disabled}
        onValueChange={(next) => next && onChange(next)}
      >
        <SelectTrigger aria-label={label} className="w-full">
          <SelectValue className="min-w-0 truncate" placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
