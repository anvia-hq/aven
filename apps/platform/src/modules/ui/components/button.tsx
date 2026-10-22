import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

export function Button({ className = "", ...props }: ComponentProps<typeof BaseButton>) {
  return (
    <BaseButton
      className={`rounded-md bg-neutral-900 px-4 py-2 text-white hover:bg-neutral-700 disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
