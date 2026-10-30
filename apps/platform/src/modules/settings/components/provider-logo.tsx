import { Servers } from "@mynaui/icons-react";

import type { ProviderKind } from "../types";

// models.dev ids; OpenAI-compatible servers have no single vendor, so they get a generic icon.
const LOGO_IDS: Partial<Record<ProviderKind, string>> = {
  openai: "openai",
  anthropic: "anthropic",
  azure: "azure",
};

// The logos are single-colour SVGs that paint with `currentColor`, which an <img> would render
// black. A mask lets them follow the theme's text colour instead.
export function ProviderLogo({ kind }: { kind: ProviderKind }) {
  const id = LOGO_IDS[kind];
  if (!id) return <Servers aria-hidden className="size-4 shrink-0 text-foreground" />;
  const url = `url(https://models.dev/logos/${id}.svg)`;
  return (
    <span
      aria-hidden
      className="inline-block size-4 shrink-0 bg-foreground"
      style={{
        maskImage: url,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskImage: url,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
