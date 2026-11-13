import { Form as BaseForm } from "@base-ui/react/form";
import type { ComponentProps } from "react";

export function Form(props: ComponentProps<typeof BaseForm>) {
  return <BaseForm {...props} />;
}
