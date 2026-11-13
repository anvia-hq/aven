import { Field } from "@base-ui/react/field";

export function FieldRoot(props: React.ComponentProps<typeof Field.Root>) {
  return <Field.Root {...props} />;
}

export function FieldLabel(props: React.ComponentProps<typeof Field.Label>) {
  return <Field.Label {...props} />;
}
