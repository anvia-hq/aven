import { LabeledSelect } from "@/components/labeled-select";
import { TextField } from "@/components/text-field";

type Props = {
  // The models the provider listed; null until they are loaded, when the model is typed instead.
  models: string[] | null;
  value: string;
  onChange: (modelId: string) => void;
  required: boolean;
  placeholder: string;
  defaultValue?: string;
};

export function ModelField({
  models,
  value,
  onChange,
  required,
  placeholder,
  defaultValue,
}: Props) {
  if (models) {
    return (
      <LabeledSelect
        label="Model"
        options={models.map((id) => ({ value: id, label: id }))}
        value={value}
        onChange={onChange}
      />
    );
  }
  return (
    <TextField
      label={required ? "Model" : "Model (optional)"}
      name="modelId"
      defaultValue={defaultValue}
      required={required}
      placeholder={placeholder}
    />
  );
}
