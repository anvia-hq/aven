import { ProviderLogo } from "./provider-logo";

export function SubsSpark() {
  return (
    <span className="relative inline-flex shrink-0">
      <ProviderLogo kind="anthropic" />
      <span
        aria-hidden
        className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-primary ring-2 ring-background"
      />
    </span>
  );
}
