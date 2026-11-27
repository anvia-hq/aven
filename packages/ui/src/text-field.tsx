import { Field } from "@base-ui/react/field";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof Field.Control> & { label: string };

export function TextField({ label, className = "", ...props }: Props) {
  return (
    <Field.Root className="flex flex-col gap-1 text-sm">
      <Field.Label>{label}</Field.Label>
      <Field.Control
        className={`w-full rounded-md border border-input px-3 py-2 text-[max(1rem,16px)] outline-none focus:border-ring md:text-sm ${className}`}
        {...props}
      />
    </Field.Root>
  );
}
